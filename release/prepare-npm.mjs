import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkNpmPackage, publicFiles, validatePackageName } from './check-npm-package.mjs';
import { buildClient } from '../scripts/build.mjs';

const exec = promisify(execFile);
const defaultSource = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function npmPack(cwd, args) {
  const { stdout } = await exec(npm, ['--userconfig', '/dev/null', '--globalconfig', '/dev/null/disabled-global', 'pack', '--ignore-scripts', '--json', ...args], { cwd, maxBuffer: 10 * 1024 * 1024 });
  const results = JSON.parse(stdout);
  if (!Array.isArray(results) || results.length !== 1) throw new Error('Expected exactly one npm package');
  return results[0];
}

async function resolveFuturePath(target) {
  try { return await realpath(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(target);
    if (parent === target) throw error;
    return path.join(await resolveFuturePath(parent), path.basename(target));
  }
}

export async function prepareNpm({ packageName, output, sourceRoot = defaultSource }) {
  validatePackageName(packageName);
  if (typeof output !== 'string' || !output) throw new Error('An explicit output directory is required');
  const source = await realpath(sourceRoot);
  const destination = await resolveFuturePath(path.resolve(output));
  const relative = path.relative(source, destination);
  if (!relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error('Output must be outside the source tree');
  const existing = await readdir(destination).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  if (existing.length) throw new Error('Output directory must be empty; existing artifacts will not be overwritten');
  const original = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const listing = await npmPack(source, ['--dry-run']);
  const filenames = listing.files.map(entry => entry.path).sort();
  if (new Set(filenames).size !== filenames.length || filenames.some(name => !publicFiles.has(name))) throw new Error('npm dry-run contains a forbidden path outside the public source allowlist');
  for (const name of filenames) {
    const filename = path.join(source, name); const stat = await lstat(filename);
    if (!stat.isFile() || await realpath(filename) !== filename) throw new Error(`Public source must contain regular files without symlink escapes: ${name}`);
  }
  // Build from public source with a target-specific registration; never patch a compiled bundle.
  const client = await buildClient({ sourceRoot: source, packageName, allowedFiles: new Set(filenames) });
  await mkdir(destination, { recursive: true });
  const stageDirectory = path.join(destination, 'package'); await mkdir(stageDirectory);
  for (const name of filenames) {
    await mkdir(path.dirname(path.join(stageDirectory, name)), { recursive: true });
    await copyFile(path.join(source, name), path.join(stageDirectory, name));
  }
  const pkg = { ...original, name: packageName, files: filenames.filter(name => name !== 'package.json'), publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/', tag: 'latest' } };
  delete pkg.scripts; delete pkg.devDependencies;
  await writeFile(path.join(stageDirectory, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(path.join(stageDirectory, 'cordis.patch.yml'), `- insert:\n    - id: plugin-finder\n      name: ${JSON.stringify(packageName)}\n`);
  await writeFile(path.join(stageDirectory, 'dist/client.js'), client);
  const packed = await npmPack(stageDirectory, ['--pack-destination', destination]);
  if (path.basename(packed.filename) !== packed.filename || !packed.filename.endsWith('.tgz')) throw new Error('Unsafe npm artifact filename');
  const tarball = path.join(destination, packed.filename);
  const checked = await checkNpmPackage({ tarball, packageName });
  const manifest = path.join(destination, 'manifest.json');
  await writeFile(manifest, `${JSON.stringify({ packageName, version: checked.version, tarball: packed.filename, sha256: checked.sha256, files: checked.files, sourceRepository: 'https://github.com/oxmumu3/dsh-plugin-finder.git' }, null, 2)}\n`);
  await writeFile(path.join(destination, 'SHA256SUMS'), `${checked.sha256}  ${packed.filename}\n`);
  return { tarball, manifest, stageDirectory, packageName, version: checked.version, sha256: checked.sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--package-name' || args[2] !== '--output') throw new Error('Usage: node release/prepare-npm.mjs --package-name NAME --output DIRECTORY');
    console.log(JSON.stringify(await prepareNpm({ packageName: args[1], output: args[3] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
