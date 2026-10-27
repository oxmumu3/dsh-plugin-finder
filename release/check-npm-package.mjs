import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { parseDocument } from 'yaml';

// Deliberately frozen to the reviewed public source. New files require review here.
export const publicFiles = new Set([
  'package.json', 'index.js', 'catalog/index.mjs', 'catalog/README.md',
  'dist/client.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'CHANGELOG.md',
  ...['install', 'verification', 'first-use-case', 'experiment', 'data-sharing',
    'creator-preview', 'featured-preview', 'single-flow-preview', 'experience-v2-preview',
    'workspace-flow-preview', 'community-browse-preview', 'proactive-discovery', 'rc3-compatibility'].map(name => `docs/${name}.md`),
  ...['client-style', 'client', 'community-catalog-data', 'community-catalog',
    'community-presentation', 'community-selection', 'community-view', 'contracts',
    'creation-guide', 'creation', 'creator-feedback', 'creator-handoff', 'discovery',
    'eligibility', 'execution-conversation-view', 'execution-markdown', 'execution-preparation',
    'experience-style', 'experience-view', 'featured-catalog', 'featured-view', 'featured',
    'feedback', 'history', 'lifecycle', 'model', 'plugin-installation', 'provenance', 'routes',
    'runtime-context', 'service', 'brand-mark', 'opportunities', 'opportunity-api', 'opportunity-client', 'opportunity-context', 'opportunity-origin', 'opportunity-view', 'supply', 'telemetry-api', 'telemetry-config',
    'telemetry-contract', 'telemetry', 'workspace-execution'].map(name => `src/${name}.js`),
]);

export function validatePackageName(name) {
  const component = '[a-z0-9][a-z0-9._-]*';
  if (typeof name !== 'string' || name.length > 214 || !new RegExp(`^(?:@${component}/)?${component}$`).test(name) || ['node_modules', 'favicon.ico'].includes(name)) {
    throw new Error(`Invalid npm package name: ${JSON.stringify(name)}`);
  }
}

function fail(message) { throw new Error(message); }

// Read regular tar members in memory; never extract archive paths to disk or run package code.
function readTarball(bytes) {
  if (bytes.length > 25 * 1024 * 1024) fail('Package archive is too large');
  const tar = gunzipSync(bytes, { maxOutputLength: 100 * 1024 * 1024 });
  const files = new Map(); const paths = new Set();
  const field = (header, start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0];
  const octal = text => /^[0-7]+$/.test(text.trim()) ? Number.parseInt(text.trim(), 8) : fail('Malformed tar numeric field');
  let offset = 0; let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) {
      if (tar.subarray(offset).some(byte => byte !== 0)) fail('Unexpected data after tar terminator');
      ended = true; break;
    }
    const checksum = octal(field(header, 148, 8));
    const computed = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== computed) fail('Malformed tar checksum');
    const prefix = field(header, 345, 155); const name = `${prefix ? `${prefix}/` : ''}${field(header, 0, 100)}`;
    const type = field(header, 156, 1); const size = octal(field(header, 124, 12));
    if (!/^[A-Za-z0-9@_./+-]+$/.test(name) || name.includes('\\') || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.') || !name.startsWith('package/')) fail('Unsafe package archive path');
    if (paths.has(name) || paths.size >= 1000) fail('Duplicate or excessive package archive entries');
    paths.add(name);
    if (!['', '0', '5'].includes(type)) fail('Forbidden archive member type (links and extensions are not accepted)');
    if (offset + size > tar.length) fail('Truncated package archive');
    const relative = name.slice('package/'.length);
    if (type === '5') {
      if (size || !['', 'src/', 'docs/', 'catalog/', 'dist/'].includes(relative)) fail('Forbidden package archive directory');
    } else {
      if (!publicFiles.has(relative)) fail(`File is outside the public payload allowlist: ${relative}`);
      files.set(relative, tar.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  if (!ended || !files.size) fail('Incomplete package archive');
  return files;
}

async function verifyPayload(files, packageName) {
  const get = name => files.get(name)?.toString('utf8') ?? fail(`Missing package file: ${name}`);
  const pkg = JSON.parse(get('package.json'));
  if (pkg.name !== packageName) fail('Package name does not match requested identity');
  if (pkg.version !== '0.10.0-preview.5') fail('Unexpected package version');
  if (pkg.author !== '牛村木木山') fail('Incorrect package author identity');
  if (pkg.repository?.type !== 'git' || pkg.repository?.url !== 'https://github.com/oxmumu3/dsh-plugin-finder.git') fail('Incorrect canonical repository');
  if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.tag !== 'latest' || pkg.publishConfig?.registry !== 'https://registry.npmjs.org/') fail('Incorrect npm publishConfig');
  if (pkg.scripts && Object.keys(pkg.scripts).length || pkg.devDependencies || pkg.bin || pkg.workspaces || pkg.bundleDependencies || pkg.bundledDependencies) fail('Package must contain no lifecycle/build scripts, development dependencies, binaries, or bundled dependencies');
  if (pkg.type !== 'module' || pkg.exports?.['.'] !== './index.js' || pkg.exports?.['./client'] !== './dist/client.js' || pkg.exports?.['./package.json'] !== './package.json' || Object.keys(pkg.exports).length !== 3) fail('Incorrect package exports');
  if (!Array.isArray(pkg.files) || !pkg.files.length || new Set(pkg.files).size !== pkg.files.length || pkg.files.some(name => !publicFiles.has(name))) fail('Declared files violate the public payload allowlist');
  const declared = new Set(['package.json', ...pkg.files]);
  for (const name of declared) get(name);
  for (const name of files.keys()) if (!declared.has(name)) fail(`Undeclared package payload file: ${name}`);
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml' || pkg.dsh?.manifestVersion !== 1 || pkg.dsh?.client?.platform !== 'web') fail('Incorrect DSH manifest');
  const patch = get('cordis.patch.yml');
  let parsedPatch;
  try {
    const document = parseDocument(patch, { strict: true, uniqueKeys: true });
    if (document.errors.length || document.warnings.length) throw new Error('Invalid or unsupported YAML syntax');
    parsedPatch = document.toJS({ maxAliasCount: 0 });
  } catch { fail('Cordis patch is not valid supported YAML'); }
  if (!isDeepStrictEqual(parsedPatch, [{ insert: [{ id: 'plugin-finder', name: packageName }] }])) fail('Cordis patch must preserve plugin-finder and use the requested module name');
  for (const [name, bytes] of files) {
    const text = bytes.toString('utf8');
    if (text.includes('\uFFFD') || text.includes('\0')) fail(`Non-text package payload: ${name}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:npm_[A-Za-z0-9]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/.test(text)) fail(`Possible credential or secret in package file: ${name}`);
    if (/奥克斯木木山|ox 木木山/.test(text)) fail(`Incorrect author identity in package file: ${name}`);
    if (name.endsWith('.js') || name.endsWith('.mjs')) {
      // Parse JS rather than matching example import statements inside catalog strings.
      const parsed = await build({ stdin: { contents: text, sourcefile: name }, bundle: false, write: false, metafile: true, logLevel: 'silent' });
      const imports = Object.values(parsed.metafile.outputs).flatMap(output => output.imports);
      for (const item of imports.filter(item => item.path.startsWith('.'))) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), item.path));
        if (target.startsWith('../') || !files.has(target)) fail(`Missing local import referenced by ${name}: ${item.path}`);
      }
    }
  }
  // Running just the wrapper captures registrations without executing its factory or package code.
  const registrations = [];
  try {
    vm.runInNewContext(get('dist/client.js'), { window: { __ModuleLoader__: { load: registration => registrations.push(registration) } } }, { timeout: 1000, codeGeneration: { strings: false, wasm: false } });
  } catch { fail('Client module wrapper is invalid'); }
  if (registrations.length !== 1 || registrations[0]?.id !== packageName || typeof registrations[0]?.factory !== 'function') fail('Client module registration does not match requested package');
  const backend = get('index.js');
  for (const stable of ["name='plugin-finder'", "name:'plugin_finder'", "name:'plugin_finder_history'", "name:'plugin_finder_telemetry'"]) if (!backend.includes(stable)) fail('Stable plugin/storage identity was changed');
  if (!/(?:const|var) PANEL = ["']dsh-plugin-finder["']/.test(get('dist/client.js'))) fail('Stable client panel identity was changed');
  return pkg;
}

export async function checkNpmPackage({ tarball, packageName }) {
  validatePackageName(packageName);
  const bytes = await readFile(tarball); const files = readTarball(bytes);
  const pkg = await verifyPayload(files, packageName);
  return { name: pkg.name, version: pkg.version, sha256: createHash('sha256').update(bytes).digest('hex'), files: [...files.keys()].sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--package-name' || args[2] !== '--tarball') fail('Usage: node release/check-npm-package.mjs --package-name NAME --tarball FILE.tgz');
    console.log(JSON.stringify(await checkNpmPackage({ packageName: args[1], tarball: args[3] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
