import { createHash } from 'node:crypto';
import { assessCompatibility, inferCapabilities } from '../catalog/index.mjs';

const INDEX_URL = 'https://awesome-dsh-plugin.com/index.json';
const TOPIC_URL = 'https://github.com/topics/dsh-plugin';
const TTL = 5 * 60 * 1000;
const ALLOWED_HOSTS = new Set(['awesome-dsh-plugin.com', 'api.github.com', 'registry.npmjs.org', 'raw.githubusercontent.com']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const localized = value => typeof value === 'string' ? value : value?.zh ?? value?.en ?? Object.values(value ?? {}).find(text => typeof text === 'string') ?? '';
const unique = values => [...new Set(values.filter(Boolean))];
const safePath = value => {
  if (typeof value !== 'string' || !value || /[\\?#:\u0000-\u001f]/u.test(value) || value.startsWith('/') || value.split('/').includes('..')) throw new Error('Unsafe repository path');
  return value.replace(/^\.\//, '');
};
const repositoryOf = value => {
  const raw = typeof value === 'string' ? value : value?.url;
  const clean = String(raw ?? '').replace(/^git\+/, '').replace(/^github:/, 'https://github.com/').replace(/\.git(?:#.*)?$/, '').replace(/#.*$/, '');
  const match = clean.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/);
  return match ? { name: match[1], url: `https://github.com/${match[1]}`, directory: typeof value?.directory === 'string' ? safePath(value.directory) : '' } : null;
};

function abortIfNeeded(...signals) {
  if (signals.some(signal => signal?.aborted)) throw new DOMException('Discovery cancelled', 'AbortError');
}

function termsFor(intent) {
  const phrases = unique([...(intent?.queries ?? []), ...(intent?.capabilities ?? [])].map(value => String(value).toLowerCase().normalize('NFKC').trim()).filter(Boolean));
  const terms = new Set();
  for (const phrase of phrases) {
    for (const term of phrase.match(/[a-z0-9][a-z0-9._-]{1,}/g) ?? []) if (!['plugin', 'plugins', 'dsh', 'the', 'and', 'with'].includes(term)) terms.add(term);
    for (const segment of phrase.match(/[\p{Script=Han}]+/gu) ?? []) {
      if (segment.length <= 8) terms.add(segment);
      for (let i = 0; i < segment.length - 1; i++) if (!['插件', '需要', '支持', '生成', '使用', '进行', '一个', '相关'].includes(segment.slice(i, i + 2))) terms.add(segment.slice(i, i + 2));
    }
  }
  return [...terms].slice(0, 70);
}

function rankEntry(entry, terms) {
  const name = String(entry.name ?? '').toLowerCase();
  const description = typeof entry.description === 'string' ? entry.description : Object.values(entry.description ?? {}).join(' ');
  const haystack = [name, localized(entry.title), description, ...(entry.metadata?.keywords ?? [])].join(' ').toLowerCase();
  return terms.reduce((score, term) => score + (name.includes(term) ? 8 : haystack.includes(term) ? 3 : 0), 0);
}

function versionOf(entry, hostVersion) {
  const versions = (entry.versions ?? []).filter(version => typeof version.version === 'string' && version.source && assessCompatibility({ compatibility: { dsh: version.engines?.dsh } }, hostVersion).status !== 'incompatible');
  const stable = versions.filter(version => !version.version.includes('-'));
  const pool = stable.length ? stable : versions;
  return pool.find(version => version.version === entry.defaultVersion) ?? pool.sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))[0];
}

function dshRange(manifest) {
  if (typeof manifest.engines?.dsh === 'string') return manifest.engines.dsh;
  const peers = Object.entries(manifest.peerDependencies ?? {}).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')).map(([, range]) => range).filter(range => !['*', 'workspace:*', 'workspace:^', 'workspace:~'].includes(range));
  return peers.length ? unique(peers) : null;
}

function keyRequirement(documentation) {
  const text = String(documentation);
  // "Cannot run without a key" is a requirement, not a keyless declaration.
  // Give explicit prohibitions on keyless use precedence over a nearby free
  // phrase; optional higher-limit features are handled separately below.
  const noKeyless = /(?:cannot|can't|can’t|can not|will not|won't|unable to)[^.\n]{0,40}(?:run|work|operate|function|start|be used)[^.\n]{0,30}without[^.\n]{0,20}api[ -]?key|\bno\s+keyless\s+(?:mode|access|support)\b|(?:没有|不提供|不支持)[^。\n]{0,10}(?:免\s*key|无密钥)[^。\n]{0,10}(?:模式|访问)|没有[^。\n]{0,15}(?:api\s*key|密钥)[^。\n]{0,12}(?:无法|不能)(?:运行|使用)/i.test(text);
  if (noKeyless) return 'required';
  const free = /no\s+(?:(?:additional|extra|separate)\s+)?api[ -]?keys?\s+(?:is\s+|are\s+)?required|without\s+(?:an?\s+)?(?:extra\s+)?api[ -]?key|无需[^。\n]{0,20}(?:api\s*key|密钥)|免\s*key/i.test(text);
  const optional = /(?:api[ -]?key[^\n。]{0,40}(?:optional|可选)|(?:optional|可选)[^\n。]{0,40}api[ -]?key)/i.test(text);
  const required = /(?:requires?|需要|必填)[^\n。]{0,25}(?:api[ -]?key|密钥)|api[ -]?key[^\n。]{0,20}(?:is required|必填)/i.test(text);
  return free ? optional || required ? 'optional' : 'not-required' : optional ? 'optional' : required ? 'required' : 'unknown';
}

export function createDiscovery({ market, fetchImpl = fetch, now = () => new Date(), signal: externalLifetimeSignal } = {}) {
  const ownLifetime = new AbortController();
  const lifetimeSignal = AbortSignal.any([ownLifetime.signal, externalLifetimeSignal].filter(Boolean));
  const cache = new Map();
  const milliseconds = () => { const value = now(); return value instanceof Date ? value.getTime() : Number(value); };
  const iso = () => new Date(milliseconds()).toISOString();

  async function waitForHost(promise, signal) {
    abortIfNeeded(signal, lifetimeSignal);
    const signals = [signal, lifetimeSignal].filter(Boolean);
    if (!signals.length) return promise;
    const combined = AbortSignal.any(signals);
    return new Promise((resolve, reject) => {
      const abort = () => { combined.removeEventListener('abort', abort); reject(new DOMException('Discovery cancelled', 'AbortError')); };
      combined.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(value => { combined.removeEventListener('abort', abort); resolve(value); }, error => { combined.removeEventListener('abort', abort); reject(error); });
    });
  }

  async function read(url, { signal, maxBytes = 512 * 1024, method = 'GET' } = {}) {
    abortIfNeeded(signal, lifetimeSignal);
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port || !ALLOWED_HOSTS.has(target.hostname)) throw new Error('Source URL outside the read-only HTTPS allowlist');
    const signals = [signal, lifetimeSignal, AbortSignal.timeout(15000)].filter(Boolean);
    const response = await waitForHost(fetchImpl(target.href, { method, redirect: 'error', signal: AbortSignal.any(signals), headers: { 'User-Agent': 'dsh-plugin-finder/0.2 live-discovery', Accept: 'application/json, text/plain;q=0.8' } }), signal);
    abortIfNeeded(signal, lifetimeSignal);
    if (method === 'HEAD' && response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${target.hostname}`);
    if (method === 'HEAD') return '';
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Source exceeds response size limit');
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body ?? []) {
      abortIfNeeded(signal, lifetimeSignal); bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error('Source exceeds response size limit');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async function json(url, { signal, maxBytes } = {}) {
    const previous = cache.get(url);
    if (previous && milliseconds() - previous.at < TTL) return { value: previous.value, status: 'cached', fetchedAt: previous.fetchedAt };
    try {
      const value = JSON.parse(await read(url, { signal, maxBytes }));
      const record = { value, at: milliseconds(), fetchedAt: iso() }; cache.set(url, record);
      return { value, status: 'live', fetchedAt: record.fetchedAt };
    } catch (error) {
      abortIfNeeded(signal, lifetimeSignal);
      if (previous) return { value: previous.value, status: 'stale', fetchedAt: previous.fetchedAt, error: String(error.message).slice(0, 250) };
      throw error;
    }
  }

  async function authorDetails(row, context) {
    const { signal, hostVersion, nodeVersion, platform, warnings } = context;
    const entry = row.entry; const chosen = versionOf(entry, hostVersion);
    if (entry.versions?.length && !chosen) throw new Error(`${entry.name}: no compatible index version`);
    let manifest; let manifestUrl; let commit; let repo; let directory = ''; let spec; let sourceType; let registry;
    if (chosen?.source.type === 'npm') {
      registry = chosen.source.registry ?? 'https://registry.npmjs.org/';
      if (new URL(registry).origin !== 'https://registry.npmjs.org') throw new Error(`${entry.name}: custom registry requires host confirmation`);
      manifestUrl = `https://registry.npmjs.org/${encodeURIComponent(entry.name).replace('%40', '@')}/${encodeURIComponent(chosen.version)}`;
      // npm's scoped-package path uses a literal slash in the conventional URL.
      manifestUrl = manifestUrl.replace(/%2F/gi, '/');
      manifest = (await json(manifestUrl, { signal })).value;
      if (manifest.name !== entry.name || manifest.version !== chosen.version) throw new Error(`${entry.name}: registry package identity mismatch`);
      spec = `${manifest.name}@${manifest.version}`; sourceType = 'npm';
      repo = repositoryOf(manifest.repository) ?? repositoryOf(entry.repository);
      commit = /^[a-f0-9]{40}$/.test(manifest.gitHead ?? '') ? manifest.gitHead : undefined;
      directory = repo?.directory ?? '';
    } else {
      repo = repositoryOf(chosen?.source?.url ?? entry.repository);
      if (!repo) throw new Error(`${entry.name}: no supported author repository`);
      commit = chosen?.source?.commit;
      if (!/^[a-f0-9]{40}$/.test(commit ?? '')) commit = (await json(`https://api.github.com/repos/${repo.name}/commits/HEAD`, { signal })).value.sha;
      if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error(`${entry.name}: author commit missing`);
      directory = chosen?.source?.path ? safePath(chosen.source.path) : repo.directory;
      manifestUrl = `https://raw.githubusercontent.com/${repo.name}/${commit}/${directory ? directory + '/' : ''}package.json`;
      manifest = (await json(manifestUrl, { signal })).value;
      if (chosen && (manifest.name !== entry.name || manifest.version !== chosen.version)) throw new Error(`${entry.name}: author package identity mismatch`);
      if (!manifest.name || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version ?? '')) throw new Error(`${entry.name}: invalid author manifest`);
      spec = `git+${repo.url}.git#${commit}${directory ? '&path:/' + directory : ''}`; sourceType = 'git';
    }
    const patch = manifest.dsh?.bundle?.patch;
    const patches = typeof patch === 'string' ? [patch] : Array.isArray(patch) ? patch : [];
    if (!patches.length || patches.length > 8) throw new Error(`${manifest.name}: author manifest does not declare dsh.bundle.patch`);
    patches.forEach(safePath);
    const compatibility = { dsh: dshRange(manifest), node: manifest.engines?.node ?? null, basis: manifest.engines?.dsh ? 'engines.dsh' : 'author-peer-dependencies' };
    const hostCompatibility = assessCompatibility({ compatibility }, hostVersion);
    const nodeCompatibility = assessCompatibility({ compatibility: { dsh: compatibility.node, basis: 'engines.node' } }, nodeVersion ?? process.versions.node);
    if (hostCompatibility.status === 'incompatible' || nodeCompatibility.status === 'incompatible') throw new Error(`${manifest.name}: author-declared runtime incompatibility`);
    if (platform && Array.isArray(manifest.os) && manifest.os.length && !manifest.os.includes(platform) && manifest.os.some(value => !value.startsWith('!'))) throw new Error(`${manifest.name}: author-declared platform incompatibility`);
    const limitations = ['来自动态来源与作者资料的候选线索；尚未安装、运行或验证组合。'];
    let readiness = 'metadata-only'; const entrypoints = [];
    if (sourceType === 'git') {
      const base = `https://raw.githubusercontent.com/${repo.name}/${commit}/${directory ? directory + '/' : ''}`;
      for (const path of patches) await read(base + safePath(path), { signal, maxBytes: 128 * 1024 });
      const runtimeEntry = typeof manifest.main === 'string' ? manifest.main : typeof manifest.exports?.['.'] === 'string' ? manifest.exports['.'] : manifest.exports?.['.']?.default;
      if (typeof runtimeEntry === 'string') {
        const url = base + safePath(runtimeEntry);
        const exists = await read(url, { signal, method: 'HEAD' });
        entrypoints.push({ path: runtimeEntry, url, status: exists === null ? 'missing' : 'present' });
        if (exists === null) {
          if (!manifest.scripts?.prepare) throw new Error(`${manifest.name}: fixed Git source misses runtime entry and has no prepare build`);
          readiness = 'source-build-required'; limitations.push('固定 Git 源缺少生成入口，需宿主安装授权和 prepare 构建；本插件未执行构建。');
        }
      }
    } else limitations.push('已核对精确 npm 版本的 bundle 清单，未下载或执行安装包；实际安装仍由宿主确认。');
    let documentation = { url: null, text: '', readAt: null, truncated: false };
    if (repo) {
      const ref = commit ?? 'HEAD';
      const paths = unique([directory ? `${directory}/README.md` : 'README.md', 'README.md', 'README.zh.md']);
      for (const path of paths) {
        const url = `https://raw.githubusercontent.com/${repo.name}/${ref}/${path}`;
        try {
          const text = await read(url, { signal });
          documentation = { url, text: text.slice(0, 6000), readAt: iso(), truncated: text.length > 6000 };
          if (!commit) limitations.push('README 读取的是作者当前分支，可能与所列 npm 版本不同；需核对版本差异。');
          break;
        } catch { abortIfNeeded(signal, lifetimeSignal); }
      }
    }
    if (!documentation.text) { const warning = `${manifest.name}: README unavailable; only manifest and index evidence read`; warnings.push(warning); limitations.push('本轮未能读取作者 README，输入输出与首次使用方式仍待确认。'); }
    const description = String(manifest.description ?? localized(entry.description) ?? '').trim();
    const sourceDescription = localized(entry.description);
    const keywords = unique([...(Array.isArray(manifest.keywords) ? manifest.keywords : []), ...(Array.isArray(entry.metadata?.keywords) ? entry.metadata.keywords : [])].filter(word => typeof word === 'string')).slice(0, 20);
    const capabilities = unique([description.slice(0, 140), sourceDescription.slice(0, 140), ...keywords.slice(0, 4), ...inferCapabilities(description + ' ' + sourceDescription)]).slice(0, 12);
    if (!capabilities.length) capabilities.push(String(manifest.name).slice(0, 140));
    const extraApiKey = keyRequirement(description + '\n' + documentation.text);
    return {
      id: manifest.name, name: manifest.name, title: localized(entry.title) || manifest.name,
      summary: description.slice(0, 700), authorDescription: description.slice(0, 700), author: typeof manifest.author === 'string' ? manifest.author.replace(/\s*<[^>]*>/g, '').slice(0, 120) : manifest.author?.name ?? repo?.name.split('/')[0] ?? '',
      repository: repo?.url ?? null, homepage: typeof manifest.homepage === 'string' && manifest.homepage.startsWith('https://') ? manifest.homepage : repo?.url ?? null,
      capabilities, keywords, inputs: [], outputs: [], firstUse: '', requirements: { extraApiKey, platforms: Array.isArray(manifest.os) ? manifest.os.filter(value => !value.startsWith('!')) : [], notes: ['账号、输入输出和首次使用前提来自作者资料；未知条件需在会话确认。'] }, limitations,
      compatibility, hostCompatibility, nodeCompatibility,
      install: { type: sourceType, spec, version: manifest.version, ...(commit ? { commit } : {}), ...(registry ? { registry } : {}), readiness, entrypoints, lifecycleScripts: ['preinstall', 'install', 'postinstall', 'prepare'].filter(key => manifest.scripts?.[key]) },
      sourceTags: [row.origin], documentation, match: { score: row.score, terms: row.terms ?? [], capabilities: [] },
      evidence: { metadata: 'manifest-checked', installation: 'not-tested', task: 'not-tested', combination: 'not-tested', capabilityBasis: 'author-description/index-keywords as quoted functionality clues; README supplied for model interpretation; not execution proof', fetchedAt: iso(), sources: [
        { kind: row.origin.id === 'github-topic' ? 'github-topic' : 'market-index', url: row.origin.url, query: row.query, fetchedAt: row.origin.fetchedAt },
        { kind: sourceType === 'npm' ? 'registry-manifest' : 'manifest', url: manifestUrl },
        ...(documentation.url ? [{ kind: 'author-documentation', url: documentation.url, fetchedAt: documentation.readAt, sha256: sha256(documentation.text) }] : []),
      ] },
    };
  }

  return {
    close() { ownLifetime.abort(); cache.clear(); },
    async search({ intent, hostVersion, nodeVersion, platform, signal } = {}) {
      abortIfNeeded(signal, lifetimeSignal);
      const terms = termsFor(intent); const query = String((intent?.queries ?? []).find(value => /[a-z]/i.test(value)) ?? intent?.queries?.[0] ?? intent?.goal ?? '').slice(0, 80);
      const rows = []; const sources = []; const warnings = [];
      const addRows = (entries, origin, forced = false) => {
        for (const entry of entries) {
          const score = rankEntry(entry, terms);
          if (score || forced) rows.push({ entry, origin, score: score || 1, query, terms });
        }
      };
      await Promise.all([
        (async () => {
          try {
            const result = await json(INDEX_URL, { signal, maxBytes: 8 * 1024 * 1024 });
            if (result.value.format !== 1 || !Array.isArray(result.value.plugins)) throw new Error('Unsupported format-1 market index');
            const source = { id: 'awesome', title: localized(result.value.title) || 'Awesome DSH Plugin', url: INDEX_URL, status: result.status, fetchedAt: result.fetchedAt, total: result.value.plugins.length, ...(result.error ? { error: result.error } : {}) };
            sources.push(source); addRows(result.value.plugins, source);
            if (result.error) warnings.push(`Awesome source is stale: ${result.error}`);
          } catch (error) { abortIfNeeded(signal, lifetimeSignal); sources.push({ id: 'awesome', title: 'Awesome DSH Plugin', url: INDEX_URL, status: 'failed', fetchedAt: null, total: 0, error: String(error.message).slice(0, 250) }); warnings.push('Awesome 插件来源本轮读取失败。'); }
        })(),
        (async () => {
          const searchUrl = `https://api.github.com/search/repositories?${new URLSearchParams({ q: `topic:dsh-plugin ${query}`, per_page: '12' })}`;
          try {
            const result = await json(searchUrl, { signal, maxBytes: 2 * 1024 * 1024 });
            if (!Array.isArray(result.value.items)) throw new Error('Invalid GitHub topic search result');
            const source = { id: 'github-topic', title: 'GitHub dsh-plugin topic', url: TOPIC_URL, queryUrl: searchUrl, status: result.status, fetchedAt: result.fetchedAt, total: result.value.total_count ?? result.value.items.length, totalKind: 'matches', ...(result.error ? { error: result.error } : {}) };
            sources.push(source);
            addRows(result.value.items.filter(item => repositoryOf(item.html_url)).map(item => ({ name: item.name ?? item.full_name.split('/').pop(), title: item.full_name, description: item.description ?? '', repository: { url: item.html_url } })), source, true);
            if (result.error) warnings.push(`GitHub topic source is stale: ${result.error}`);
          } catch (error) { abortIfNeeded(signal, lifetimeSignal); sources.push({ id: 'github-topic', title: 'GitHub dsh-plugin topic', url: TOPIC_URL, status: 'failed', fetchedAt: null, total: 0, error: String(error.message).slice(0, 250) }); warnings.push('GitHub topic 补充检索本轮读取失败。'); }
        })(),
        (async () => {
          let host;
          try { host = typeof market === 'function' ? await waitForHost(market(), signal) : market; }
          catch (error) { sources.push({ id: 'host-market', title: 'DSH 已配置市场', url: '', status: 'failed', fetchedAt: null, total: 0, error: String(error.message).slice(0, 250) }); warnings.push('DSH 已配置市场不可读取。'); return; }
          if (!host?.listIndexes || !host?.search) { sources.push({ id: 'host-market', title: 'DSH 已配置市场', url: '', status: 'unconfigured', fetchedAt: null, total: 0 }); return; }
          try {
            const indexes = await waitForHost(host.listIndexes(), signal);
            if (!indexes.length) { sources.push({ id: 'host-market', title: 'DSH 已配置市场', url: '', status: 'unconfigured', fetchedAt: null, total: 0 }); return; }
            if (indexes.length > 8) warnings.push('本轮仅读取前 8 个已配置市场，其余来源尚未搜索。');
            for (const index of indexes.slice(0, 8)) {
              abortIfNeeded(signal, lifetimeSignal);
              const source = { id: `host-market:${sha256(index.url).slice(0, 10)}`, title: localized(index.title) || 'DSH 已配置市场', url: index.url, status: 'live', fetchedAt: null, total: 0, totalKind: 'matches' };
              try {
                if (index.error) throw new Error(index.error);
                const result = await waitForHost(host.search(index.url, { text: query, sort: { kind: 'relevance' }, offset: 0, limit: 12 }), signal);
                source.total = result.total ?? result.entries?.length ?? 0; source.fetchedAt = result.fetchedAt ? new Date(result.fetchedAt).toISOString() : iso();
                if (result.fetchedAt && milliseconds() - result.fetchedAt > 1000) source.status = 'cached';
                addRows(result.entries ?? [], source, true);
              } catch (error) { source.status = 'failed'; source.error = String(error.message).slice(0, 250); warnings.push(`已配置市场读取失败：${source.title}`); }
              sources.push(source);
            }
          } catch (error) { abortIfNeeded(signal, lifetimeSignal); sources.push({ id: 'host-market', title: 'DSH 已配置市场', url: '', status: 'failed', fetchedAt: null, total: 0, error: String(error.message).slice(0, 250) }); warnings.push('DSH 市场源列表不可读取。'); }
        })(),
      ]);
      abortIfNeeded(signal, lifetimeSignal);
      if (!sources.some(source => ['live', 'cached'].includes(source.status))) {
        const error = new Error('插件来源暂时不可读取，当前无法确认搜索结果，请重试。'); error.code = 'DISCOVERY_UNAVAILABLE'; error.sources = sources; error.warnings = warnings; throw error;
      }
      const ranked = rows.sort((a, b) => b.score - a.score);
      const distinct = []; const identities = new Map();
      for (const row of ranked) {
        const version = versionOf(row.entry, hostVersion);
        const key = `${row.entry.name}\n${repositoryOf(row.entry.repository)?.url ?? ''}\n${version?.version ?? ''}\n${JSON.stringify(version?.source ?? {})}`;
        const existing = identities.get(key);
        if (existing) { existing.origins ??= [existing.origin]; existing.origins.push(row.origin); continue; }
        identities.set(key, row); distinct.push(row);
      }
      const candidates = []; let inspected = 0;
      for (let index = 0; index < Math.min(distinct.length, 12) && candidates.length < 6; index += 3) {
        const group = distinct.slice(index, Math.min(index + 3, 12)); inspected += group.length;
        const results = await Promise.all(group.map(async row => {
          try { const entry = await authorDetails(row, { signal, hostVersion, nodeVersion, platform, warnings }); entry.sourceTags = unique(row.origins ?? [row.origin]); return entry; }
          catch (error) { abortIfNeeded(signal, lifetimeSignal); warnings.push(String(error.message).slice(0, 300)); return null; }
        }));
        for (const result of results.filter(Boolean)) {
          const existing = candidates.find(entry => entry.name === result.name && entry.install.version === result.install.version);
          if (existing && existing.install.spec !== result.install.spec) {
            const conflict = `${result.name}@${result.install.version} 存在安装来源冲突：保留首项但未合并信任。来源 1：${existing.install.spec}；来源 2：${result.install.spec}。安装前需人工核对作者与精确来源。`;
            warnings.push(conflict); existing.limitations.push(conflict);
            existing.evidence.sourceConflicts ??= [];
            existing.evidence.sourceConflicts.push({ retainedSpec: existing.install.spec, otherSpec: result.install.spec, otherRepository: result.repository, otherCommit: result.install.commit ?? null, sources: result.evidence.sources });
          } else if (existing) existing.sourceTags.push(...result.sourceTags.filter(tag => !existing.sourceTags.some(old => old.id === tag.id)));
          else candidates.push(result);
        }
      }
      if (distinct.length > inspected) warnings.push(`本轮从来源匹配 ${distinct.length} 条候选，按相关性读取前 ${inspected} 条作者资料；尚未逐条核验全部候选。`);
      return { candidates: candidates.slice(0, 6), sources, warnings: unique(warnings), searchedAt: iso() };
    },
  };
}
