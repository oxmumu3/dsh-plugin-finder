import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog, searchCatalog, getPluginDetails } from '../catalog/index.mjs';
import { refreshCatalog, validateSource, fetchText } from '../scripts/refresh-catalog.mjs';

const item = (id, capabilities, extra = {}) => ({
  id, name: id, title: id, summary: '', capabilities, keywords: [],
  requirements: { extraApiKey: 'not-required', platforms: ['darwin', 'linux', 'win32'] },
  compatibility: { dsh: '>=0.2.1-0 <0.3.0' },
  install: { version: '1.0.0', commit: 'a'.repeat(40), spec: `git+https://github.com/test/${id}.git#${'a'.repeat(40)}` },
  evidence: { metadata: 'verified', installation: 'not-tested', task: 'not-tested', sources: [] },
  ...extra,
});
const fixture = { schemaVersion: 1, generatedAt: '2026-10-20T00:00:00Z', plugins: [
  item('data-profile', ['data-analysis', 'data-quality'], { summary: 'Profile CSV and detect missing values' }),
  item('report', ['report-writing'], { summary: 'Compose a business report' }),
  item('paid-search', ['web-search'], { requirements: { extraApiKey: 'required', platforms: ['darwin'] } }),
  item('unknown-search', ['web-search'], { requirements: { extraApiKey: 'unknown', platforms: ['darwin'] } }),
  item('old-review', ['code-review'], { compatibility: { dsh: '^0.1.7' } }),
  item('unknown-review', ['code-review'], { compatibility: { dsh: null } }),
] };

test('Chinese task language retrieves capability matches without English plugin names', () => {
  const hits = searchCatalog(fixture, { query: '检查投放表格里的重复、缺失和异常，然后生成周报' });
  assert.equal(hits[0].id, 'data-profile');
  assert.ok(hits.some(hit => hit.id === 'report'));
  assert.ok(hits[0].match.capabilities.includes('data-quality'));
});

test('unrelated free text returns an empty set instead of a popular fallback', () => {
  assert.deepEqual(searchCatalog(fixture, { query: '给银行核心系统开通内部转账接口' }), []);
});

test('hard requirements filter keys, platform and all required capabilities', () => {
  assert.deepEqual(searchCatalog(fixture, { capabilities: ['web-search'], requiresNoApiKey: true }), []);
  assert.deepEqual(searchCatalog(fixture, { capabilities: ['web-search'], platform: 'linux' }), []);
  assert.deepEqual(searchCatalog(fixture, { requiredCapabilities: ['data-analysis', 'data-quality'] }).map(x => x.id), ['data-profile']);
});

test('known blocked source packages are not offered as installable recommendations', () => {
  const catalog = { plugins: [item('broken', ['data-analysis'], { install: { readiness: 'blocked' } }), item('build-required', ['data-analysis'], { install: { readiness: 'source-build-required' } })] };
  assert.deepEqual(searchCatalog(catalog, { query: '数据分析' }).map(x => x.id), ['build-required']);
});

test('host filter excludes declared incompatibility and preserves unknown evidence honestly', () => {
  const hits = searchCatalog(fixture, { capabilities: ['code-review'], hostVersion: '0.2.1-rc.2' });
  assert.deepEqual(hits.map(x => x.id), ['unknown-review']);
  assert.equal(hits[0].hostCompatibility.status, 'unknown');
  assert.equal(searchCatalog(fixture, { capabilities: ['data-quality'], hostVersion: '0.2.1-rc.2' })[0].hostCompatibility.status, 'compatible');
});

test('compatibility follows DSH includePrerelease behavior across release-candidate patches', () => {
  const catalog = { plugins: [item('browser', ['web-fetch'], { compatibility: { dsh: '>=0.2.0-rc.2' } }), item('old', ['web-fetch'], { compatibility: { dsh: '^0.1.7' } })] };
  const hits = searchCatalog(catalog, { capabilities: ['web-fetch'], hostVersion: '0.2.1-rc.2' });
  assert.deepEqual(hits.map(x => x.id), ['browser']);
});

test('Node runtime requirements cannot be hidden by a matching DSH version', () => {
  const catalog = { plugins: [item('node24', ['workflow-persistence'], { compatibility: { dsh: '>=0.2.0-rc.2', node: '>=24' } })] };
  assert.deepEqual(searchCatalog(catalog, { query: '保存工作流', hostVersion: '0.2.1-rc.2', nodeVersion: '22.22.0' }), []);
  const hits = searchCatalog(catalog, { query: '保存工作流', hostVersion: '0.2.1-rc.2', nodeVersion: '24.0.0' });
  assert.equal(hits[0].nodeCompatibility.status, 'compatible');
});

test('natural task variants recall evidence and code-review capabilities', () => {
  const catalog = { plugins: [item('evidence', ['evidence-ledger']), item('reviewer', ['code-review']), item('git', ['git-workflow'])] };
  assert.ok(searchCatalog(catalog, { query: '研究竞品并核对每个结论的来源' }).some(x => x.id === 'evidence'));
  assert.equal(searchCatalog(catalog, { query: '只读审查我的 Git 改动' })[0].id, 'reviewer');
});

test('lookup does not mutate the bundled evidence or let one caller change later results', () => {
  const result = getPluginDetails(fixture, 'data-profile');
  result.capabilities.push('made-up');
  assert.ok(!getPluginDetails(fixture, 'data-profile').capabilities.includes('made-up'));
  assert.equal(getPluginDetails(fixture, '../secret'), null);
});

test('bundled catalog contains only pinned real bundles with provenance and honest proof states', async () => {
  const catalog = await loadCatalog();
  assert.ok(catalog.plugins.length >= 10 && catalog.plugins.length <= 20);
  for (const plugin of catalog.plugins) {
    assert.match(plugin.install.commit, /^[a-f0-9]{40}$/);
    assert.match(plugin.install.spec, /#[a-f0-9]{40}(?:&path:\/[A-Za-z0-9_./-]+)?$/);
    assert.ok(plugin.bundlePatches.length > 0);
    assert.equal(plugin.evidence.metadata, 'verified');
    assert.equal(plugin.evidence.installation, 'not-tested');
    assert.equal(plugin.evidence.task, 'not-tested');
    assert.ok(plugin.evidence.sources.every(source => source.url.startsWith('https://')));
    assert.ok(plugin.evidence.sources.some(source => source.kind === 'manifest'));
    assert.ok(plugin.evidence.sources.some(source => source.kind === 'bundle-patch'));
  }
});

test('refresh source allowlist rejects arbitrary URLs and traversal paths', () => {
  assert.throws(() => validateSource({ repository: 'https://127.0.0.1/secret' }), /repository/);
  assert.throws(() => validateSource({ repository: 'author/repo', manifestPath: '../secret' }), /path/);
  assert.throws(() => validateSource({ repository: 'author/repo', readmePath: 'http://example.com' }), /path/);
});

test('refresh refuses a changed package identity before reading or executing anything else', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finder-catalog-'));
  try {
    const result = await refreshCatalog({
      sources: [{ id: 'original', repository: 'test/original', expectedName: 'original' }],
      output: join(directory, 'catalog.json'),
      fetchImpl: async url => new Response(JSON.stringify(String(url).includes('commits/HEAD') ? { sha: 'b'.repeat(40) } : { name: 'different-package', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })),
    });
    assert.equal(result.catalog.plugins.length, 0);
    assert.match(result.errors[0].message, /identity/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('refresh failure retains last verified item and surfaces the error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finder-catalog-'));
  try {
    const output = join(directory, 'catalog.json');
    await writeFile(output, JSON.stringify({ ...fixture, plugins: [fixture.plugins[0]] }));
    const source = { id: 'data-profile', repository: 'test/data-profile', title: 'Data', capabilities: ['data-analysis'], summary: 'Data analysis', requirements: { extraApiKey: 'not-required' } };
    const result = await refreshCatalog({ sources: [source], output, fetchImpl: async () => { throw new Error('simulated offline'); }, now: () => new Date('2026-10-20T01:00:00Z') });
    assert.equal(result.errors.length, 1);
    assert.equal(result.catalog.plugins[0].install.commit, 'a'.repeat(40));
    assert.equal(result.catalog.plugins[0].evidence.metadata, 'verified');
    assert.equal(result.catalog.plugins[0].refresh.status, 'failed-kept-last-success');
    assert.match(result.errors[0].message, /offline/);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).plugins.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('refresh records a missing declared runtime entry and distinguishes prepare from a blocked source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finder-readiness-'));
  try {
    const result = await refreshCatalog({
      sources: ['blocked', 'prepare'].map(id => ({ id, repository: `test/${id}`, expectedName: id, summary: 'Source plugin' })),
      output: join(directory, 'catalog.json'),
      fetchImpl: async (url, options) => {
        const name = String(url).includes('/prepare/') ? 'prepare' : 'blocked';
        if (String(url).endsWith('/commits/HEAD')) return new Response(JSON.stringify({ sha: 'c'.repeat(40) }));
        if (String(url).endsWith('/package.json')) return new Response(JSON.stringify({ name, version: '1.0.0', main: './lib/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } }, scripts: name === 'prepare' ? { prepare: 'node build.mjs' } : { prepublishOnly: 'node build.mjs' } }));
        if (options.method === 'HEAD') return new Response(null, { status: 404 });
        return new Response('author metadata');
      },
    });
    assert.equal(result.errors.length, 0);
    const blocked = result.catalog.plugins.find(x => x.id === 'blocked');
    const prepare = result.catalog.plugins.find(x => x.id === 'prepare');
    assert.equal(blocked.install.readiness, 'blocked');
    assert.equal(prepare.install.readiness, 'source-build-required');
    assert.equal(blocked.install.entrypoints[0].status, 'missing');
    assert.ok(blocked.limitations.some(note => note.includes('prepare')));
    assert.ok(prepare.limitations.some(note => note.includes('构建')));
    assert.match(blocked.summary, /暂不可推荐/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP reads reject redirects, non-HTTPS destinations and oversized responses', async () => {
  await assert.rejects(fetchText('http://example.com', { fetchImpl: async () => new Response('x') }), /HTTPS/);
  await assert.rejects(fetchText('https://example.com', { fetchImpl: async () => new Response('', { status: 302 }) }), /302/);
  await assert.rejects(fetchText('https://example.com', { maxBytes: 4, fetchImpl: async () => new Response('oversized') }), /size/);
});
