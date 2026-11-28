import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMarketIndex } from '../scripts/build-market-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:(?:0|[1-9]\d*)|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;
const DATA_SVG = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]*={0,2})$/u;

function assertLocalized(value, label) {
  assert.equal(typeof value, 'object', `${label} must be localized object`);
  assert.ok(value !== null && !Array.isArray(value), `${label} must not be array/null`);
  assert.equal(typeof value.en, 'string', `${label}.en required`);
  assert.ok(value.en.trim().length > 0, `${label}.en non-empty`);
  for (const [lang, text] of Object.entries(value)) {
    assert.match(lang, LANGUAGE_ID, `${label}.${lang} lowercase tag`);
    assert.equal(typeof text, 'string', `${label}.${lang} string`);
    assert.ok(text.trim().length > 0, `${label}.${lang} non-empty`);
  }
}

test('root index.json stays synchronized with build-market-index.mjs and DSH format 1 rules', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const rawIndex = await readFile(path.join(ROOT, 'index.json'), 'utf8');
  const expected = `${JSON.stringify(await buildMarketIndex(), null, 2)}\n`;
  assert.equal(rawIndex, expected, 'index.json must stay in sync with scripts/build-market-index.mjs');

  const doc = JSON.parse(rawIndex);
  assert.equal(doc.format, 1);
  assertLocalized(doc.title, 'title');
  assertLocalized(doc.description, 'description');

  const categories = doc.metadata?.categories ?? {};
  const labels = doc.metadata?.labels ?? {};
  const sortKeys = doc.metadata?.sortKeys ?? {};
  for (const [id, entry] of Object.entries(categories)) assertLocalized(entry.title, `categories.${id}`);
  for (const [id, entry] of Object.entries(labels)) assertLocalized(entry.title, `labels.${id}`);
  for (const [id, entry] of Object.entries(sortKeys)) {
    assertLocalized(entry.title, `sortKeys.${id}`);
    assert.ok(['asc', 'desc'].includes(entry.order), `sortKeys.${id}.order`);
  }

  assert.equal(doc.plugins.length, 7);
  for (const plugin of doc.plugins) assert.ok(typeof plugin.icon === 'string' && plugin.icon.startsWith('data:image/svg+xml;base64,'), `${plugin.name}.icon required`);
  const seen = new Set();
  for (const plugin of doc.plugins) {
    assert.match(plugin.name, PACKAGE_NAME);
    assert.ok(!seen.has(plugin.name), `duplicate ${plugin.name}`);
    seen.add(plugin.name);

    assertLocalized(plugin.title, `${plugin.name}.title`);
    assertLocalized(plugin.description, `${plugin.name}.description`);

    const repoUrl = new URL(plugin.repository.url);
    assert.equal(repoUrl.protocol, 'https:');
    assert.equal(repoUrl.search, '');
    assert.equal(repoUrl.hash, '');
    assert.ok(URL.canParse(plugin.homepage), `${plugin.name}.homepage URL`);

    if (plugin.icon !== undefined) {
      const match = DATA_SVG.exec(plugin.icon);
      assert.ok(match, `${plugin.name}.icon base64 svg`);
      assert.ok(Buffer.from(match[1], 'base64').byteLength <= 32 * 1024, `${plugin.name}.icon size`);
    }

    assert.ok(Object.hasOwn(categories, plugin.metadata.category), `${plugin.name}.category declared`);
    assert.ok(Array.isArray(plugin.metadata.keywords) && plugin.metadata.keywords.length > 0);
    for (const label of plugin.metadata.labels) {
      assert.ok(Object.hasOwn(labels, label), `${plugin.name}.label ${label} declared`);
    }
    for (const [sortKey, rank] of Object.entries(plugin.metadata.sortKeys)) {
      assert.ok(Object.hasOwn(sortKeys, sortKey), `${plugin.name}.sortKey ${sortKey} declared`);
      assert.ok(Number.isFinite(rank));
    }

    assert.ok(Array.isArray(plugin.versions) && plugin.versions.length > 0);
    for (const v of plugin.versions) {
      assert.match(v.version, SEMVER, `${plugin.name} version`);
      assert.ok(Number.isInteger(v.publishTimestamp), `${plugin.name} unix seconds`);
      assert.ok(v.publishTimestamp >= 1_700_000_000 && v.publishTimestamp < 1e11);
      assert.equal(v.source.type, 'npm');
      assert.ok(typeof v.engines?.dsh === 'string' && v.engines.dsh.trim().length > 0);
    }
  }

  const self = doc.plugins.find(p => p.name === '@oxmumu3/dsh-plugin-finder');
  assert.ok(self, 'self entry missing');
  assert.equal(self.versions[0].version, pkg.version);
  assert.equal(self.versions[0].engines.dsh, pkg.engines.dsh);
  assert.ok(self.icon?.startsWith('data:image/svg+xml;base64,'));
});
