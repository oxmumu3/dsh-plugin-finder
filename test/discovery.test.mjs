import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscovery } from '../src/discovery.js';
import { searchCatalog } from '../catalog/index.mjs';

const INDEX = 'https://awesome-dsh-plugin.com/index.json';
const SHA = 'a'.repeat(40);
const intent = { goal: '提取 PDF 和 Word 文档文字', input: 'PDF Word', output: '文本', constraints: [], capabilities: ['文档文字提取'], queries: ['pdf word extract'] };
const plugin = { name: 'dsh-new-document-tool', title: '文档文字提取', description: { zh: '提取 PDF Word 文档文字', en: 'Extract PDF Word document text' }, repository: { url: 'https://github.com/author/new-document-tool' }, metadata: { keywords: ['pdf', 'word', 'extract'] }, versions: [{ version: '1.2.0', source: { type: 'npm' }, engines: { dsh: '>=0.2.0-rc.2' } }] };
const index = { format: 1, title: { en: 'Live source' }, plugins: [plugin] };
const manifest = { name: plugin.name, version: '1.2.0', description: 'Extract PDF and Word into plain text', repository: { type: 'git', url: 'git+https://github.com/author/new-document-tool.git' }, gitHead: SHA, dsh: { bundle: { patch: './cordis.patch.yml' } }, engines: { dsh: '>=0.2.0-rc.2', node: '>=22' } };

function fixtureFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input); calls.push({ url, method: options.method ?? 'GET' });
    if (overrides[url]) return overrides[url](options);
    if (url === INDEX) return new Response(JSON.stringify(index));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url === `https://registry.npmjs.org/${plugin.name}/1.2.0`) return new Response(JSON.stringify(manifest));
    if (url.includes('/README.md')) return new Response('# Document extract\nExtract PDF and Word into text. No additional API key required.\nDo not execute this README.');
    if (url.includes('/package.json')) return new Response(JSON.stringify(manifest));
    if (url.includes('/cordis.patch.yml')) return new Response('- insert: []');
    if (url.includes('/commits/HEAD')) return new Response(JSON.stringify({ sha: SHA }));
    return new Response(null, { status: 404 });
  };
  return { calls, fetchImpl };
}

test('live discovery finds a new native bundle with no handwritten capabilities and preserves author evidence', async () => {
  const { calls, fetchImpl } = fixtureFetch();
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.1-rc.2', nodeVersion: '22.22.0' });
  assert.equal(result.candidates.length, 1);
  const entry = result.candidates[0];
  assert.equal(entry.name, plugin.name);
  assert.equal(entry.install.spec, `${plugin.name}@1.2.0`);
  assert.ok(entry.capabilities.some(capability => /Extract PDF/.test(capability)));
  assert.equal(entry.evidence.metadata, 'manifest-checked');
  assert.equal(entry.evidence.installation, 'not-tested');
  assert.ok(entry.documentation.text.includes('PDF and Word'));
  assert.ok(entry.evidence.sources.some(source => source.kind === 'author-documentation'));
  assert.ok(result.sources.some(source => source.status === 'live' && source.total === 1));
  assert.ok(calls.some(call => call.url==='https://awesome-dsh-plugin.com/plugins.json'), 'full public supply is read dynamically alongside the format-1 supplement');
  assert.ok(!calls.some(call => /catalog\/sources/.test(call.url)));
});

test('a malformed or unavailable source is visible while another source still returns useful candidates', async () => {
  const { fetchImpl } = fixtureFetch({ [INDEX]: () => new Response('{broken json') });
  const wrapped = async (url, options) => String(url).includes('/search/repositories?')
    ? new Response(JSON.stringify({ total_count: 1, items: [{ full_name: 'author/new-document-tool', html_url: 'https://github.com/author/new-document-tool', description: 'Extract PDF Word text' }] }))
    : fetchImpl(url, options);
  const result = await createDiscovery({ fetchImpl: wrapped }).search({ intent });
  assert.ok(result.sources.some(source => source.id === 'awesome' && source.status === 'failed'));
  assert.ok(result.sources.some(source => source.id === 'github-topic' && source.status === 'live'));
  assert.ok(result.warnings.length);
  assert.equal(result.candidates[0].name, plugin.name);
});

test('all source failures throw DISCOVERY_UNAVAILABLE instead of pretending cached seeds are complete search results', async () => {
  const discovery = createDiscovery({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(discovery.search({ intent }), error => error.code === 'DISCOVERY_UNAVAILABLE' && error.sources.every(source => ['failed', 'unconfigured'].includes(source.status)));
});

test('directory cache is reused for five minutes and stale failures are not relabelled as live', async () => {
  let at = Date.parse('2026-10-20T12:00:00Z'); let offline = false;
  const { calls, fetchImpl } = fixtureFetch();
  const discovery = createDiscovery({ now: () => new Date(at), fetchImpl: (...args) => { if (offline) throw new Error('offline'); return fetchImpl(...args); } });
  await discovery.search({ intent });
  at += 1000;
  const cached = await discovery.search({ intent });
  assert.ok(cached.sources.some(source => source.id === 'awesome' && source.status === 'cached'));
  assert.equal(calls.filter(call => call.url === INDEX).length, 1);
  at += 6 * 60 * 1000; offline = true;
  await assert.rejects(discovery.search({ intent }), error => error.code === 'DISCOVERY_UNAVAILABLE' && error.sources.some(source => source.status === 'stale'));
});

test('the same running discovery sees an upstream plugin added after cache expiry without repackaging', async () => {
  let at = Date.parse('2026-10-20T13:00:00Z'); let published = false;
  const { fetchImpl } = fixtureFetch({ [INDEX]: () => new Response(JSON.stringify({ ...index, plugins: published ? [plugin] : [] })) });
  const discovery = createDiscovery({ now: () => new Date(at), fetchImpl });
  assert.equal((await discovery.search({ intent })).candidates.length, 0);
  published = true; at += 6 * 60 * 1000;
  const result = await discovery.search({ intent });
  assert.equal(result.candidates[0].name, plugin.name);
  assert.ok(result.sources.some(source => source.id === 'awesome' && source.status === 'live'));
});

test('Chinese task terms match bilingual directory descriptions without English query tokens', async () => {
  const { fetchImpl } = fixtureFetch();
  const result = await createDiscovery({ fetchImpl }).search({ intent: { ...intent, queries: ['提取文档文字'], capabilities: ['读取本地文档'] } });
  assert.equal(result.candidates[0].name, plugin.name);
});

test('GitHub rate limiting remains visible while the curated source can still supply recommendations', async () => {
  const { fetchImpl } = fixtureFetch();
  const wrapped = (url, options) => String(url).includes('/search/repositories?') ? Promise.resolve(new Response('rate limited', { status: 429 })) : fetchImpl(url, options);
  const result = await createDiscovery({ fetchImpl: wrapped }).search({ intent });
  assert.equal(result.candidates[0].name, plugin.name);
  assert.equal(result.sources.find(source => source.id === 'github-topic').status, 'failed');
  assert.ok(result.warnings.some(warning => warning.includes('GitHub')));
});

test('deferred host market is read without modifying its configured sources', async () => {
  let resolved = 0; const searches = [];
  const market = { listIndexes: () => [{ url: 'https://team.example/index.json', title: 'Team' }], search: async (url, query) => { searches.push({ url, query }); return { total: 1, fetchedAt: Date.now(), entries: [plugin] }; } };
  const { fetchImpl } = fixtureFetch();
  const discovery = createDiscovery({ market: () => { resolved++; return market; }, fetchImpl });
  const result = await discovery.search({ intent });
  assert.equal(resolved, 1);
  assert.ok(searches.length);
  assert.ok(result.sources.some(source => source.id.startsWith('host-market:') && source.status === 'live'));
  assert.ok(result.candidates[0].sourceTags.some(source => source.id.startsWith('host-market:')));
});

test('untrusted install command strings are never used and permission scanner labels are not functional capabilities', async () => {
  const { fetchImpl } = fixtureFetch({ [INDEX]: () => new Response(JSON.stringify({ ...index, plugins: [{ ...plugin, install: 'rm -rf /', capabilities: ['fs-read', 'network'] }] })) });
  const result = await createDiscovery({ fetchImpl }).search({ intent });
  assert.equal(result.candidates[0].install.spec, `${plugin.name}@1.2.0`);
  assert.ok(!result.candidates[0].capabilities.includes('fs-read'));
  assert.ok(!result.candidates[0].capabilities.includes('network'));
});

test('README failures keep index evidence honest and cannot turn a non-bundle into a native candidate', async () => {
  const { fetchImpl } = fixtureFetch({ [`https://registry.npmjs.org/${plugin.name}/1.2.0`]: () => new Response(JSON.stringify({ ...manifest, dsh: undefined })) });
  const result = await createDiscovery({ fetchImpl }).search({ intent });
  assert.equal(result.candidates.length, 0);
  assert.ok(result.warnings.some(warning => /bundle/.test(warning)));
});

test('a missing README is reported without inventing documentation or installation proof', async () => {
  const { fetchImpl } = fixtureFetch();
  const wrapped = (url, options) => /\/README(?:\.zh)?\.md$/.test(String(url)) ? Promise.resolve(new Response(null, { status: 404 })) : fetchImpl(url, options);
  const result = await createDiscovery({ fetchImpl: wrapped }).search({ intent });
  const entry = result.candidates[0];
  assert.equal(entry.documentation.text, '');
  assert.equal(entry.documentation.url, null);
  assert.equal(entry.evidence.metadata, 'manifest-checked');
  assert.equal(entry.evidence.installation, 'not-tested');
  assert.ok(!entry.evidence.sources.some(source => source.kind === 'author-documentation'));
  assert.ok(result.warnings.some(warning => /README unavailable/.test(warning)));
});

test('undeclared host requirements remain unknown rather than silently passing compatibility', async () => {
  const unknown = { ...manifest, engines: { node: '>=22' } };
  const unversionedIndex = { ...index, plugins: [{ ...plugin, versions: [{ ...plugin.versions[0], engines: {} }] }] };
  const { fetchImpl } = fixtureFetch({ [INDEX]: () => new Response(JSON.stringify(unversionedIndex)), [`https://registry.npmjs.org/${plugin.name}/1.2.0`]: () => new Response(JSON.stringify(unknown)) });
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.1-rc.2' });
  assert.equal(result.candidates[0].hostCompatibility.status, 'unknown');
});

test('cancellation exits promptly without returning success', async () => {
  const controller = new AbortController(); controller.abort();
  const discovery = createDiscovery({ fetchImpl: async () => { throw new Error('should not fetch'); } });
  await assert.rejects(discovery.search({ intent, signal: controller.signal }), error => error.name === 'AbortError');
});

test('cancelling while an existing host market is pending does not hold the request open', async () => {
  const controller = new AbortController(); let started;
  const pending = new Promise(resolve => { started = resolve; });
  const market = { listIndexes: () => [{ url: 'https://team.example/index.json' }], search: () => { started(); return new Promise(() => {}); } };
  const { fetchImpl } = fixtureFetch();
  const request = createDiscovery({ market, fetchImpl }).search({ intent, signal: controller.signal });
  await pending;
  // Let the two finite HTTP source reads finish; cancellation must also release
  // a host SDK promise that has no signal parameter of its own.
  await new Promise(setImmediate);
  controller.abort();
  let timer;
  try { await assert.rejects(Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cancel did not release request')), 200); })]), error => error.name === 'AbortError'); }
  finally { clearTimeout(timer); }
});

test('closing discovery forbids new source reads', async () => {
  const { calls, fetchImpl } = fixtureFetch();
  const discovery = createDiscovery({ fetchImpl });
  assert.equal(typeof discovery.close, 'function');
  discovery.close();
  await assert.rejects(discovery.search({ intent }), error => error.name === 'AbortError');
  assert.equal(calls.length, 0);
});

test('closing during a pending manifest read releases the request and never starts its README', async () => {
  let started; let release;
  const began = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const { calls, fetchImpl } = fixtureFetch({ [`https://registry.npmjs.org/${plugin.name}/1.2.0`]: () => { started(); return held; } });
  const discovery = createDiscovery({ fetchImpl });
  assert.equal(typeof discovery.close, 'function');
  const request = discovery.search({ intent });
  await began; discovery.close();
  await assert.rejects(request, error => error.name === 'AbortError');
  release(new Response(JSON.stringify(manifest)));
  await new Promise(setImmediate);
  assert.ok(!calls.some(call => call.url.includes('/README')));
});

test('required-key wording is excluded by the no-extra-key filter even when it contains without', async () => {
  for (const documentation of [
    'The plugin cannot run without an API key. It requires an API key.',
    'An API key is required. There is no keyless mode.',
  ]) {
    const { fetchImpl } = fixtureFetch();
    const result = await createDiscovery({ fetchImpl: (url, options) => String(url).includes('/README.md') ? Promise.resolve(new Response(documentation)) : fetchImpl(url, options) }).search({ intent });
    assert.equal(result.candidates[0].requirements.extraApiKey, 'required', documentation);
    assert.deepEqual(searchCatalog({ plugins: result.candidates }, { query: 'pdf', requiresNoApiKey: true }), []);
  }
});

test('explicit keyless basic use and optional authenticated features remain distinguishable', async () => {
  for (const [documentation, expected] of [
    ['No additional API key required.', 'not-required'],
    ['Core tools work without an API key. An API key is optional for higher limits.', 'optional'],
    ['No API key required for local text extraction. Cloud OCR requires an API key.', 'optional'],
  ]) {
    const { fetchImpl } = fixtureFetch();
    const result = await createDiscovery({ fetchImpl: (url, options) => String(url).includes('/README.md') ? Promise.resolve(new Response(documentation)) : fetchImpl(url, options) }).search({ intent });
    assert.equal(result.candidates[0].requirements.extraApiKey, expected, documentation);
    assert.equal(searchCatalog({ plugins: result.candidates }, { query: 'pdf', requiresNoApiKey: true }).length, 1);
  }
});

test('same package and version from conflicting repositories or commits cannot be silently merged', async () => {
  for (const sameRepository of [false, true]) {
    const firstRepo = 'https://github.com/author/first';
    const secondRepo = sameRepository ? firstRepo : 'https://github.com/author/second';
    const secondCommit = 'b'.repeat(40);
    const gitEntry = (repository, commit) => ({ ...plugin, repository: { url: repository }, versions: [{ version: '1.2.0', source: { type: 'git', url: repository, commit } }] });
    const first = gitEntry(firstRepo, SHA); const second = gitEntry(secondRepo, secondCommit);
    const market = { listIndexes: () => [{ url: 'https://team.example/index.json' }], search: async () => ({ total: 1, entries: [second] }) };
    const { fetchImpl } = fixtureFetch({ [INDEX]: () => new Response(JSON.stringify({ ...index, plugins: [first] })) });
    const result = await createDiscovery({ market, fetchImpl }).search({ intent });
    const firstSpec = `git+${firstRepo}.git#${SHA}`;
    const secondSpec = `git+${secondRepo}.git#${secondCommit}`;
    assert.equal(result.candidates.length, 2);
    assert.equal(new Set(result.candidates.map(candidate=>candidate.id)).size,2);
    assert.ok(result.warnings.some(warning => warning.includes('冲突') && warning.includes(firstSpec) && warning.includes(secondSpec)));
    assert.ok(result.candidates[0].limitations.some(note => note.includes('冲突') && note.includes(firstSpec) && note.includes(secondSpec)));
    for(const candidate of result.candidates)assert.equal(candidate.sourceTags.length, 1, 'conflicting sources must not be merged into a trust list');
  }
});

const gitOnlyIndex = { format: 1, title: { en: 'GitHub only' }, plugins: [{ name: 'dsh-git-only', title: '文档文字提取', description: { zh: '提取 PDF Word 文档文字' }, repository: { url: 'https://github.com/author/git-only' }, metadata: { keywords: ['pdf', 'word', 'extract'] } }] };
const gitOnlyManifest = { name: 'dsh-git-only', version: '2.0.0', description: 'Extract PDF and Word into plain text', repository: { type: 'git', url: 'https://github.com/author/git-only' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, engines: { dsh: '0.2.2-rc.2', node: '>=22' } };

test('a rate-limited author read is named as limited, not as a missing candidate', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.coverage.excludedReasons['author-rate-limited'], 1);
  assert.equal(result.coverage.excludedReasons['author-unresolved'] ?? 0, 0);
  assert.ok(result.warnings.some(line => /GitHub 这次限制了 1 个候选/.test(line)));
  assert.ok(result.warnings.some(line => /这轮没有已返回的候选/.test(line)));
  assert.ok(result.warnings.every(line => !/已返回的候选仍可用/.test(line)));
});

test('a missing author is named as HTTP 404 and a healthy author still returns a candidate', async () => {
  const missing = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  };
  const absent = await createDiscovery({ fetchImpl: missing }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(absent.coverage.excludedReasons['author-missing'], 1);
  assert.equal(absent.candidates.length, 0);

  const healthy = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(JSON.stringify({ sha: SHA }));
    if (url.includes('/package.json')) return new Response(JSON.stringify(gitOnlyManifest));
    if (url.includes('/README.md')) return new Response('# Git only\nA GitHub-only plugin.');
    if (url.includes('/cordis.patch.yml')) return new Response('- insert: []');
    return new Response(null, { status: 404 });
  };
  const found = await createDiscovery({ fetchImpl: healthy }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].name, 'dsh-git-only');
  assert.equal(found.candidates[0].evidence.installation, 'not-tested');
  assert.equal(found.coverage.excludedReasons['author-rate-limited'] ?? 0, 0);
});

test('a plain GitHub 403 is a permission denial, not throttling', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response('forbidden', { status: 403 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-forbidden'], 1);
  assert.equal(result.coverage.excludedReasons['author-rate-limited'] ?? 0, 0);
  assert.ok(result.warnings.some(line => /HTTP 403/.test(line)));
  assert.ok(result.warnings.every(line => !/请求过快/.test(line)));
});

test('an npm 403 is not reported as a GitHub rate limit', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(index));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url === 'https://registry.npmjs.org/dsh-new-document-tool/1.2.0') return new Response('denied', { status: 403 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-forbidden'], 1);
  assert.equal(result.coverage.excludedReasons['author-rate-limited'] ?? 0, 0);
  assert.ok(result.warnings.every(line => !/GitHub 这次限制了/.test(line)));
});

test('GitHub 429 is a confirmed rate limit', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(null, { status: 429 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-rate-limited'], 1);
});

test('one candidate listed by two sources is counted once', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX || url === 'https://awesome-dsh-plugin.com/plugins.json') return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-rate-limited'], 1);
  assert.equal(result.coverage.excluded, 1);
});

test('npm 429 is a generic source limit, never a GitHub limit', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(index));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url === 'https://registry.npmjs.org/dsh-new-document-tool/1.2.0') return new Response(null, { status: 429 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-source-limited'], 1);
  assert.equal(result.coverage.excludedReasons['author-rate-limited'] ?? 0, 0);
  assert.ok(result.warnings.some(line => /HTTP 429/.test(line)));
  assert.ok(result.warnings.every(line => !/GitHub 这次限制了/.test(line)));
});

test('a 401 is reported as HTTP 401, not 403', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response(null, { status: 401 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-unauthorized'], 1);
  assert.equal(result.coverage.excludedReasons['author-forbidden'] ?? 0, 0);
  assert.ok(result.warnings.some(line => /HTTP 401/.test(line)));
  assert.ok(result.warnings.every(line => !/HTTP 403/.test(line)));
});

test('a 403 body saying "not a rate limit" is not throttling without an authoritative header', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url === INDEX) return new Response(JSON.stringify(gitOnlyIndex));
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: 0, items: [] }));
    if (url.includes('/commits/HEAD')) return new Response('this is not a rate limit', { status: 403 });
    return new Response(null, { status: 404 });
  };
  const result = await createDiscovery({ fetchImpl }).search({ intent, hostVersion: '0.2.2-rc.2', nodeVersion: '24.21.0' });
  assert.equal(result.coverage.excludedReasons['author-forbidden'], 1);
  assert.equal(result.coverage.excludedReasons['author-rate-limited'] ?? 0, 0);
});
