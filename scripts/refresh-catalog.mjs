#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const hash = text => createHash('sha256').update(text).digest('hex');
const DEFAULT_OUTPUT = fileURLToPath(new URL('catalog/plugins.json', ROOT));
const DEFAULT_SOURCES = new URL('catalog/sources.json', ROOT);

function safePath(value, fallback) {
  const path = value ?? fallback;
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(segment => segment === '..') || /[?#:\u0000-\u001f]/.test(path)) throw new Error('Invalid repository file path');
  return path.replace(/^\.\//, '');
}

export function validateSource(source) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source?.repository ?? '')) throw new Error('Invalid allowlisted GitHub repository');
  return { ...source, manifestPath: safePath(source.manifestPath, 'package.json'), readmePath: safePath(source.readmePath, 'README.md') };
}

export async function fetchText(url, { fetchImpl = fetch, maxBytes = 512 * 1024, timeoutMs = 15000 } = {}) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('HTTPS URLs without credentials are required');
  const response = await fetchImpl(target.href, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'dsh-plugin-finder/0.1 metadata-reader', Accept: 'application/vnd.github+json, text/plain;q=0.8' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} reading ${target.hostname}${target.pathname}`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > maxBytes) throw new Error('Response size limit exceeded');
  let total = 0; const chunks = [];
  if (response.body) {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > maxBytes) { await response.body.cancel().catch(() => {}); throw new Error('Response size limit exceeded'); }
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

function authorName(author, fallback) {
  if (typeof author === 'string') return author.replace(/\s*<[^>]*>|\s*\([^)]*\)/g, '').trim();
  return author?.name ?? fallback;
}

async function inspectEntrypoints(manifest, base, prefix, options) {
  const rootExport = manifest.exports?.['.'];
  const declared = [manifest.main, typeof rootExport === 'string' ? rootExport : rootExport?.default, typeof rootExport?.import === 'string' ? rootExport.import : rootExport?.import?.default].filter(path => typeof path === 'string');
  const entrypoints = [];
  for (const path of [...new Set(declared.map(path => safePath(path)))].slice(0, 4)) {
    const url = base + prefix + path;
    const response = await options.fetchImpl(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'dsh-plugin-finder/0.1 metadata-reader' } });
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status} checking declared runtime entry`);
    entrypoints.push({ path, url, status: response.ok ? 'present' : 'missing', checkedAt: options.now().toISOString() });
  }
  const missing = entrypoints.filter(entry => entry.status === 'missing');
  const readiness = missing.length ? manifest.scripts?.prepare ? 'source-build-required' : 'blocked' : 'metadata-only';
  const reason = readiness === 'blocked'
    ? `固定源码提交缺少声明的运行入口 ${missing.map(entry => entry.path).join('、')}，且未声明 prepare；当前固定 Git 安装来源暂不可推荐。`
    : readiness === 'source-build-required'
      ? `固定源码提交缺少声明的运行入口 ${missing.map(entry => entry.path).join('、')}；Git 安装依赖 prepare 构建，需要宿主安装授权/构建确认，本项目未执行构建。`
      : entrypoints.length ? '固定提交中已找到声明的运行入口；仅确认文件存在，未检查依赖加载或运行效果。' : '该包没有声明 JavaScript 主入口；已核对 bundle patch，尚未安装或启动。';
  return { readiness, readinessReason: reason, entrypoints };
}

async function readPlugin(input, options) {
  const source = validateSource(input);
  const commitInfo = JSON.parse(await fetchText(`https://api.github.com/repos/${source.repository}/commits/HEAD`, options));
  const commit = commitInfo.sha;
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('GitHub did not return an immutable commit');
  const base = `https://raw.githubusercontent.com/${source.repository}/${commit}/`;
  const manifestText = await fetchText(base + source.manifestPath, options);
  const manifest = JSON.parse(manifestText);
  if (!manifest.name || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? '')) throw new Error('Manifest lacks a package name or exact version');
  if (source.expectedName && source.expectedName !== manifest.name) throw new Error('Package identity changed from the reviewed allowlist');
  const patch = manifest.dsh?.bundle?.patch;
  const patchPaths = typeof patch === 'string' ? [patch] : Array.isArray(patch) ? patch : [];
  if (!patchPaths.length || patchPaths.length > 8) throw new Error('Manifest does not declare a bounded dsh.bundle.patch');
  const prefix = source.manifestPath.includes('/') ? source.manifestPath.slice(0, source.manifestPath.lastIndexOf('/') + 1) : '';
  const patches = [];
  for (const path of patchPaths) {
    const safe = prefix + safePath(path);
    const contents = await fetchText(base + safe, { ...options, maxBytes: 128 * 1024 });
    if (!contents.trim()) throw new Error('Declared bundle patch is empty');
    patches.push({ path, url: base + safe, sha256: hash(contents) });
  }
  const readme = await fetchText(base + source.readmePath, options);
  const sourceReadiness = await inspectEntrypoints(manifest, base, prefix, options);
  const repositoryUrl = `https://github.com/${source.repository}`;
  const peers = manifest.peerDependencies ?? {};
  const hostPeers = Object.entries(peers).filter(([name, range]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')).map(([, range]) => range).filter(range => !['*', 'workspace:*', 'workspace:^', 'workspace:~'].includes(range));
  const dshRange = manifest.engines?.dsh ?? (hostPeers.length ? [...new Set(hostPeers)] : null);
  const fetchedAt = options.now().toISOString();
  return {
    id: source.id ?? manifest.name, name: manifest.name, title: source.title ?? manifest.name,
    summary: (source.summary ?? String(manifest.description ?? '').slice(0, 280)) + (sourceReadiness.readiness === 'blocked' ? '（固定 Git 源暂不可推荐）' : sourceReadiness.readiness === 'source-build-required' ? '（固定 Git 源需构建确认）' : ''),
    authorDescription: String(manifest.description ?? '').slice(0, 700), author: authorName(manifest.author, source.repository.split('/')[0]),
    repository: repositoryUrl, homepage: manifest.homepage?.startsWith('https://') ? manifest.homepage : repositoryUrl + '#readme', license: typeof manifest.license === 'string' ? manifest.license : 'not-declared',
    capabilities: source.capabilities ?? [], keywords: [...new Set([...(source.keywords ?? []), ...(Array.isArray(manifest.keywords) ? manifest.keywords.filter(word => typeof word === 'string') : [])])],
    inputs: source.inputs ?? [], outputs: source.outputs ?? [], firstUse: source.firstUse ?? '',
    limitations: [...new Set([...(source.limitations ?? []), ...(sourceReadiness.readiness === 'metadata-only' ? [] : [sourceReadiness.readinessReason])])], requirements: { extraApiKey: 'unknown', platforms: [], notes: [], ...source.requirements },
    bundlePatches: patches.map(entry => entry.path),
    compatibility: { dsh: dshRange, basis: manifest.engines?.dsh ? 'engines.dsh' : hostPeers.length ? 'dsh-peer-dependencies-intersection' : 'not-declared', node: manifest.engines?.node ?? null },
    dependencies: manifest.dependencies ?? {}, peerDependencies: peers, optionalPeerDependencies: Object.entries(manifest.peerDependenciesMeta ?? {}).filter(([, meta]) => meta.optional).map(([name]) => name),
    install: { type: 'git', version: manifest.version, commit, repository: repositoryUrl, ...(prefix ? { path: prefix.slice(0, -1) } : {}), spec: `git+${repositoryUrl}.git#${commit}${prefix ? `&path:/${prefix.slice(0, -1)}` : ''}`, publishedAt: commitInfo.commit?.committer?.date ?? null, lifecycleScripts: ['preinstall', 'install', 'postinstall', 'prepare'].filter(key => manifest.scripts?.[key]), ...sourceReadiness },
    evidence: { metadata: 'verified', installation: 'not-tested', task: 'not-tested', combination: 'not-tested', capabilityBasis: 'curated-summary-of-author-documentation', fetchedAt, manifestSha256: hash(manifestText), readmeSha256: hash(readme), sources: [
      { kind: 'repository-commit', url: `${repositoryUrl}/commit/${commit}` },
      { kind: 'manifest', url: `${repositoryUrl}/blob/${commit}/${source.manifestPath}`, sha256: hash(manifestText) },
      { kind: 'author-documentation', url: `${repositoryUrl}/blob/${commit}/${source.readmePath}`, sha256: hash(readme) },
      ...patches.map(entry => ({ kind: 'bundle-patch', url: `${repositoryUrl}/blob/${commit}/${prefix + entry.path.replace(/^\.\//, '')}`, sha256: entry.sha256 })),
    ], note: 'Read-only package manifest, declared patch existence, and author documentation checked. No third-party code installed or executed; author claims do not establish successful tasks or safety.' },
    refresh: { status: 'success', checkedAt: fetchedAt },
  };
}

export async function refreshCatalog({ sources, output = DEFAULT_OUTPUT, fetchImpl = fetch, now = () => new Date(), concurrency = 3 } = {}) {
  const sourceList = sources ?? JSON.parse(await readFile(DEFAULT_SOURCES, 'utf8')).sources;
  if (!Array.isArray(sourceList) || sourceList.length > 20) throw new Error('At most 20 curated sources may be refreshed');
  sourceList.forEach(validateSource);
  let previous;
  try { previous = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; previous = { plugins: [] }; }
  const plugins = []; const errors = [];
  for (let index = 0; index < sourceList.length; index += Math.max(1, Math.min(concurrency, 4))) {
    const group = sourceList.slice(index, index + Math.max(1, Math.min(concurrency, 4)));
    const results = await Promise.all(group.map(async source => {
      try { return await readPlugin(source, { fetchImpl, now }); }
      catch (error) {
        errors.push({ id: source.id ?? source.repository, repository: source.repository, message: String(error.message).slice(0, 600), checkedAt: now().toISOString() });
        const old = previous.plugins.find(plugin => plugin.id === source.id || plugin.repository === `https://github.com/${source.repository}`);
        return old ? { ...old, refresh: { status: 'failed-kept-last-success', checkedAt: now().toISOString(), error: String(error.message).slice(0, 600) } } : null;
      }
    }));
    plugins.push(...results.filter(Boolean));
  }
  const catalog = { schemaVersion: 1, generatedAt: now().toISOString(), title: '发现好插件 · 首版核对索引', scope: 'A small curated set of native DSH bundles. Inclusion is not an endorsement, security certification, installation test, or task-success proof.', verificationPolicy: 'metadata-only; author capability claims; installation/task/combination untested', plugins, refreshErrors: errors };
  await mkdir(dirname(resolve(output)), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n', { mode: 0o644 });
  await rename(temporary, output);
  return { catalog, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(argument => !['--help', '-h'].includes(argument))) { console.error('No arbitrary URLs or output arguments are accepted. Edit catalog/sources.json after review.'); process.exitCode = 2; }
  else if (process.argv.includes('--help') || process.argv.includes('-h')) console.log('node scripts/refresh-catalog.mjs\nRead only the reviewed GitHub allowlist; resolve immutable commits, check manifests and patches, keep last successes. No installs or code execution.');
  else {
    const { catalog, errors } = await refreshCatalog();
    console.log(JSON.stringify({ plugins: catalog.plugins.length, generatedAt: catalog.generatedAt, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  }
}
