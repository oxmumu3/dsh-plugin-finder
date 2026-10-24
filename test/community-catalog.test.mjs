import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { communityCatalog } from '../src/community-catalog-data.js';
import { getCommunityOverview, browseCommunity, getCommunityEntry } from '../src/community-catalog.js';
import { buildCommunityCatalog, canonicalCommunityId } from '../scripts/build-community-catalog.mjs';

const research = new URL('../docs/research/ecosystem-20261023/data/', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, research), 'utf8'));
const [full, market, manifest, selection, evidence, identity] = await Promise.all(['plugins.json', 'index.json', 'fetch-manifest.json', 'preview-selection.json', 'sample-source-evidence.json', 'own-identity-evidence.json'].map(read));
const input = { full, market, manifest, selection, evidence, identity };

test('catalog is reproducible from captured metadata and explicit author review, excluding only the two unresolved own entries', () => {
  const result = buildCommunityCatalog(input);
  assert.deepEqual(result.catalog, communityCatalog);
  assert.equal(communityCatalog.sourceTotal, 6565);
  assert.equal(communityCatalog.total, 6563);
  assert.equal(communityCatalog.excludedTotal, 2);
  assert.equal(communityCatalog.marketIndexTotal, 3382);
  assert.equal(result.excluded.length, 2);
  assert.ok(result.excluded.every(row => row.sourceId.startsWith('https://github.com/piggy00544/dsh-workproof/tree/main/packages/')));
  assert.doesNotMatch(JSON.stringify(communityCatalog), /piggy00544/i);
  assert.ok(communityCatalog.entries.filter(entry => entry.preview).every(entry => [...entry.summary].length < 100 && !entry.summary.includes('\ufffd')));
});

test('six complete categories expose three reviewed representative entries each without dropping monorepo paths', () => {
  const overview = getCommunityOverview();
  assert.equal(overview.categories.length, 6);
  assert.equal(overview.categories.reduce((sum, category) => sum + category.count, 0), overview.total);
  assert.deepEqual(overview.categories.map(c => c.count), [1476, 324, 617, 1693, 994, 1459]);
  for (const category of overview.categories) {
    assert.equal(category.previews.length, 3);
    assert.ok(category.previews.every(entry => entry.preview && entry.categoryId === category.id));
  }
  assert.equal(new Set(communityCatalog.entries.map(entry => entry.id)).size, overview.total);
  const paths = communityCatalog.entries.filter(entry => entry.id.startsWith('https://github.com/ecnu/eduwork/tree/'));
  assert.ok(paths.length > 1, 'distinct plugins inside the same repository must remain browsable');
  assert.ok(paths.every(entry => getCommunityEntry(entry.id) === entry));
});

test('browse filters category and AND query tokens locally with bounded pages and empty recovery', () => {
  const target = getCommunityOverview().categories[0].previews[0];
  const filtered = browseCommunity({ categoryId: target.categoryId, query: `${target.owner.toUpperCase()} ${target.name}` });
  assert.ok(filtered.entries.some(entry => entry.id === target.id));
  assert.ok(filtered.entries.every(entry => entry.categoryId === target.categoryId));
  assert.equal(browseCommunity({ query: target.name + ' no-match-unique-92' }).total, 0);
  assert.deepEqual(browseCommunity({ categoryId: 'not-a-category', page: 99 }), { entries: [], total: 0, page: 1, pageSize: 24, pages: 0 });
  assert.equal(browseCommunity({ pageSize: 100000 }).entries.length, 60);
  assert.equal(browseCommunity({ pageSize: -3, page: -5 }).entries.length, 1);
  const last = browseCommunity({ page: 100000, pageSize: 24 });
  assert.equal(last.page, last.pages);
  assert.ok(last.entries.length > 0 && last.entries.length <= 24);
  assert.deepEqual(browseCommunity({ page: NaN, pageSize: Infinity }), browseCommunity());
});

test('full pagination preserves each canonical identity once and caller mutation cannot poison later reads', () => {
  const seen = new Set();
  const first = browseCommunity({ pageSize: 60 });
  for (let page = 1; page <= first.pages; page++) for (const entry of browseCommunity({ pageSize: 60, page }).entries) {
    assert.ok(!seen.has(entry.id)); seen.add(entry.id);
  }
  assert.equal(seen.size, communityCatalog.total);
  const entry = first.entries[0];
  assert.throws(() => { entry.summary = 'forged'; }, TypeError);
  const overview = getCommunityOverview(); overview.categories[0].sourceCategories.pop(); overview.categories[0].previews.length = 0;
  assert.equal(getCommunityOverview().categories[0].previews.length, 3);
  assert.equal(getCommunityEntry('https://github.com/not-a-real-entry'), null);
  assert.equal(getCommunityEntry({ id: entry.id }), null);
});

test('author sources are HTTPS GitHub entry URLs and metadata excludes executable content', () => {
  const keys = ['id', 'name', 'owner', 'summary', 'sourceCategory', 'categoryId', 'repositoryUrl', 'npmName', 'version', 'stars', 'sourceUrl', 'preview'].sort();
  for (const entry of communityCatalog.entries) {
    assert.deepEqual(Object.keys(entry).sort(), keys);
    assert.equal(canonicalCommunityId(entry.sourceUrl), entry.id);
    assert.equal(entry.repositoryUrl, entry.sourceUrl);
    assert.ok([...entry.summary].length <= 240);
  }
  assert.equal(canonicalCommunityId('https://github.com/Owner/Repo/tree/Main/Plugins/MyPlugin'), 'https://github.com/owner/repo/tree/Main/Plugins/MyPlugin');
  for (const url of ['javascript:alert(1)', 'https://evil.test/a/b', 'https://github.com/a/b?download=1', 'https://user:pass@github.com/a/b']) assert.throws(() => canonicalCommunityId(url));
});

test('builder fails closed on missing author review, conflicting identities and unknown source categories', () => {
  assert.throws(() => buildCommunityCatalog({ ...input, evidence: { entries: [] } }), /reviewed author/);
  assert.throws(() => buildCommunityCatalog({ ...input, identity: { entries: [] } }), /identity disposition/);
  assert.throws(() => buildCommunityCatalog({ ...input, full: { ...full, plugins: [...full.plugins, { ...full.plugins[0], url: 'https://github.com/piggy00544/unreviewed' }] } }), /identity disposition/);
  assert.throws(() => buildCommunityCatalog({ ...input, full: { ...full, plugins: [...full.plugins, full.plugins[0]] } }), /Duplicate canonical/);
  const changed = { ...full, plugins: full.plugins.map((row, i) => i ? row : { ...row, category: 'future-unknown' }) };
  assert.throws(() => buildCommunityCatalog({ ...input, full: changed }), /Unmapped source category/);
});
