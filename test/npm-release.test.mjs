import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parse as parseYaml } from 'yaml';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const sha = data => createHash('sha256').update(data).digest('hex');
const prepareUrl = new URL('../release/prepare-npm.mjs', import.meta.url);
const checkerUrl = new URL('../release/check-npm-package.mjs', import.meta.url);

test('public source and default publication share the canonical scoped identity', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.name, '@oxmumu3/dsh-plugin-finder');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.deepEqual(parseYaml(await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')), [{ insert: [{ id: 'plugin-finder', name: pkg.name }] }]);
  assert.deepEqual(pkg.publishConfig, { access: 'public', registry: 'https://registry.npmjs.org/', tag: 'latest' });
});

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'finder-npm-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, 'source'); await mkdir(source);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const item of ['package.json', 'catalog/README.md', ...pkg.files]) {
    await mkdir(path.dirname(path.join(source, item)), { recursive: true });
    await cp(path.join(root, item), path.join(source, item), { recursive: true });
  }
  // None of these unpublished files may enter the generated package.
  for (const name of ['collector/server.js', 'admin/dashboard.html', '.agent/memory.md', 'test/private.test.mjs', 'release/private.mjs', '.github/workflows/private.yml', '.npmrc', '.env']) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), 'PRIVATE_FIXTURE_DO_NOT_SHIP');
  }
  return { source, base, output: path.join(base, 'artifact') };
}

async function materialize(t, packageName = '@actual-owner/dsh-plugin-finder') {
  assert.ok(await readFile(prepareUrl).catch(() => null), 'npm preparation CLI must exist');
  const { prepareNpm } = await import(prepareUrl);
  const f = await fixture(t);
  const snapshotFiles = ['package.json', 'cordis.patch.yml', 'dist/client.js', 'src/client.js', 'index.js'];
  const before = await Promise.all(snapshotFiles.map(name => readFile(path.join(f.source, name)).then(sha)));
  const result = await prepareNpm({ sourceRoot: f.source, packageName, output: f.output });
  const after = await Promise.all(snapshotFiles.map(name => readFile(path.join(f.source, name)).then(sha)));
  assert.deepEqual(after, before, 'preparation must not change public source or legacy build');
  return { ...f, result };
}

async function repack(f, mutate) {
  const edited = await mkdtemp(path.join(f.base, 'edited-'));
  await cp(f.result.stageDirectory, edited, { recursive: true });
  await mutate(edited);
  const { stdout } = await run('npm', ['pack', '--ignore-scripts', '--json'], { cwd: edited });
  return path.join(edited, JSON.parse(stdout)[0].filename);
}

test('npm preparation CLI requires explicit name and output before doing work', async () => {
  assert.ok(await readFile(prepareUrl).catch(() => null), 'npm preparation CLI must exist');
  const result = await run(process.execPath, [fileURLToPath(prepareUrl)]).catch(error => error);
  assert.notEqual(result.code, undefined);
  assert.match(result.stderr, /--package-name.*--output/);
});

for (const packageName of ['@actual-owner/dsh-plugin-finder', 'dsh-plugin-finder']) {
  test(`materializes and independently checks the real ${packageName} artifact`, async t => {
    const f = await materialize(t, packageName);
    const { checkNpmPackage } = await import(checkerUrl);
    const checked = await checkNpmPackage({ tarball: f.result.tarball, packageName });
    assert.equal(checked.name, packageName); assert.equal(checked.version, JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version);
    const pkg = JSON.parse(await readFile(path.join(f.result.stageDirectory, 'package.json'), 'utf8'));
    assert.equal(pkg.publishConfig.access, 'public'); assert.equal(pkg.publishConfig.tag, 'latest');
    assert.equal(pkg.publishConfig.registry, 'https://registry.npmjs.org/');
    assert.equal(pkg.scripts, undefined); assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.author, '牛村木木山');
    const client = await readFile(path.join(f.result.stageDirectory, 'dist/client.js'), 'utf8');
    const registrations = [];
    vm.runInNewContext(client, { window: { __ModuleLoader__: { load: item => registrations.push(item) } } });
    assert.equal(registrations.length, 1); assert.equal(registrations[0].id, packageName);
    assert.match(client, /(?:const|var) PANEL = ["']dsh-plugin-finder["']/);
    assert.equal(await readFile(path.join(f.result.stageDirectory, 'index.js'), 'utf8'), await readFile(path.join(f.source, 'index.js'), 'utf8'));
    const patchFile = path.join(f.result.stageDirectory, 'cordis.patch.yml');
    assert.deepEqual(parseYaml(await readFile(patchFile, 'utf8')), [{ insert: [{ id: 'plugin-finder', name: packageName }] }]);
    const manifest = JSON.parse(await readFile(f.result.manifest, 'utf8'));
    assert.equal(manifest.packageName, packageName); assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.tarball, path.basename(f.result.tarball));
    assert.equal(manifest.sha256, sha(await readFile(f.result.tarball)));
    assert.ok(checked.files.every(name => !/^(collector|admin|test|release|\.github|\.agent)\//.test(name)));
    assert.ok(checked.files.every(name => !/\.npmrc|\.env|package-lock/.test(name)));
    assert.deepEqual((await readdir(f.output)).sort(), [path.basename(f.result.tarball), 'package', 'SHA256SUMS', 'manifest.json'].sort());
  });
}

test('invalid names and source-contained or symlinked output paths fail before mutation', async t => {
  assert.ok(await readFile(prepareUrl).catch(() => null), 'npm preparation CLI must exist');
  const { prepareNpm } = await import(prepareUrl); const f = await fixture(t);
  for (const packageName of ['@Bad/name', '../escape', '@scope', 'name;touch pwned', '']) {
    await assert.rejects(prepareNpm({ sourceRoot: f.source, packageName, output: f.output }), /package name/i);
  }
  await assert.rejects(prepareNpm({ sourceRoot: f.source, packageName: 'finder', output: path.join(f.source, 'new-output') }), /outside.*source/i);
  assert.equal((await readdir(f.source)).includes('new-output'), false);
  await symlink(f.source, path.join(f.base, 'alias'));
  await assert.rejects(prepareNpm({ sourceRoot: f.source, packageName: 'finder', output: path.join(f.base, 'alias', 'new-output') }), /outside.*source/i);
});

test('an unexpected private path in the declared files fails closed', async t => {
  assert.ok(await readFile(prepareUrl).catch(() => null), 'npm preparation CLI must exist');
  const { prepareNpm } = await import(prepareUrl); const f = await fixture(t);
  const filename = path.join(f.source, 'package.json'); const pkg = JSON.parse(await readFile(filename));
  pkg.files.push('collector/'); await writeFile(filename, JSON.stringify(pkg));
  await assert.rejects(prepareNpm({ sourceRoot: f.source, packageName: '@owner/finder', output: f.output }), /public.*allowlist|forbidden/i);
});

test('client compilation rejects imports through an out-of-source symlink before creating output', async t => {
  const { prepareNpm } = await import(prepareUrl); const f = await fixture(t);
  await writeFile(path.join(f.base, 'private-client.js'), 'export const privateMarker = "DO_NOT_SHIP";\n');
  await symlink(path.join(f.base, 'private-client.js'), path.join(f.source, 'src/escape.js'));
  const client = path.join(f.source, 'src/client.js');
  await writeFile(client, `${await readFile(client, 'utf8')}\nimport './escape.js';\n`);
  await assert.rejects(prepareNpm({ sourceRoot: f.source, packageName: '@owner/finder', output: f.output }), /public.*allowlist|source.*boundary|symlink/i);
  assert.equal(await readdir(f.output).catch(() => null), null);
});

test('checker rejects wrong identity, Cordis name, client module, exports, scripts, and private payload', async t => {
  const f = await materialize(t); const { checkNpmPackage } = await import(checkerUrl);
  const mutatePackage = change => async directory => {
    const filename = path.join(directory, 'package.json'); const pkg = JSON.parse(await readFile(filename)); change(pkg); await writeFile(filename, JSON.stringify(pkg));
  };
  const cases = [
    [mutatePackage(pkg => { pkg.name = '@wrong/finder'; }), /package name|identity/i],
    [mutatePackage(pkg => { pkg.repository.url = 'https://github.com/piggy00544/dsh-plugin-finder.git'; }), /repository/i],
    [mutatePackage(pkg => { pkg.author = '奥克斯木木山'; }), /author|identity/i],
    [mutatePackage(pkg => { pkg.publishConfig.tag = 'next'; }), /publishConfig/i],
    [async dir => writeFile(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: plugin-finder\n      name: wrong-finder\n'), /Cordis/i],
    [async dir => writeFile(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: plugin-finder\n      name: @actual-owner/dsh-plugin-finder\n'), /YAML|Cordis/i],
    [async dir => writeFile(path.join(dir, 'dist/client.js'), 'window.__ModuleLoader__.load({id:"wrong-finder", factory:()=>({})});\n'), /module/i],
    [async dir => writeFile(path.join(dir, 'dist/client.js'), '// broken wrapper\\nwindow.__ModuleLoader__.load({id:"@actual-owner/dsh-plugin-finder", factory:()=>({})});'), /module/i],
    [mutatePackage(pkg => { pkg.exports['./client'] = './dist/missing.js'; }), /exports|missing/i],
    [async dir => writeFile(path.join(dir, 'src/feedback.js'), 'export { missing } from "./missing.js";'), /local import|missing/i],
    [mutatePackage(pkg => { pkg.scripts = { postinstall: 'node scripts/build.mjs' }; }), /scripts|lifecycle/i],
    [async dir => { await mkdir(path.join(dir, 'src/admin'), { recursive: true }); await writeFile(path.join(dir, 'src/admin/credentials.js'), 'PRIVATE'); const filename = path.join(dir, 'package.json'); const pkg = JSON.parse(await readFile(filename)); pkg.files.push('src/admin/'); await writeFile(filename, JSON.stringify(pkg)); }, /allowlist|forbidden/i],
    [async dir => writeFile(path.join(dir, 'src/feedback.js'), 'export const token = "npm_abcdefghijklmnopqrstuvwxyz1234567890";'), /credential|secret/i],
  ];
  for (const [mutate, message] of cases) {
    await assert.rejects(checkNpmPackage({ tarball: await repack(f, mutate), packageName: '@actual-owner/dsh-plugin-finder' }), message);
  }
});

test('checker rejects tar paths and symlinks without extracting them', async t => {
  const f = await materialize(t); const { checkNpmPackage } = await import(checkerUrl);
  const original = gunzipSync(await readFile(f.result.tarball));
  for (const [kind, message] of [['traversal', /unsafe.*path/i], ['symlink', /member type/i], ['truncated', /archive|gzip|unexpected/i]]) {
    const tar = Buffer.from(original);
    if (kind === 'traversal') { tar.fill(0, 0, 100); tar.write('package/../../escape', 0); }
    if (kind === 'symlink') tar[156] = '2'.charCodeAt(0);
    if (kind !== 'truncated') {
      tar.fill(32, 148, 156);
      const checksum = tar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
      tar.write(`${checksum}\0 `, 148);
    }
    const filename = path.join(f.base, `${kind}.tgz`);
    await writeFile(filename, gzipSync(kind === 'truncated' ? tar.subarray(0, 700) : tar));
    await assert.rejects(checkNpmPackage({ tarball: filename, packageName: '@actual-owner/dsh-plugin-finder' }), message);
  }
});

test('workflow defaults to preparation and restricts publishing to the verified main repository', async () => {
  const filename = new URL('../.github/workflows/npm-release.yml', import.meta.url);
  assert.ok(await readFile(filename).catch(() => null), 'manual npm release workflow must exist');
  const workflow = await readFile(filename, 'utf8');
  assert.match(workflow, /workflow_dispatch:/); assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow, /publish:[\s\S]*?default: false/);
  assert.match(workflow, /github\.repository == 'oxmumu3\/dsh-plugin-finder'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /vars\.NPM_PACKAGE_NAME/);
  assert.match(workflow, /needs: prepare/); assert.match(workflow, /id-token: write/);
  assert.equal(workflow.match(/id-token: write/g).length, 1);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|registry-url|npm (?:login|config)/);
  assert.match(workflow, /npm publish .*--access public --tag latest --provenance/);
  assert.match(workflow, /node-version: '24'/); assert.match(workflow, /11\.5\.1/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
});

test('workflow resolves runner artifact directories at runtime before consuming them', async t => {
  const workflow = parseYaml(await readFile(new URL('../.github/workflows/npm-release.yml', import.meta.url), 'utf8'));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finder-workflow-env-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, job] of Object.entries(workflow.jobs)) {
    for (const value of Object.values(job.env ?? {})) {
      assert.doesNotMatch(String(value), /\$\{\{\s*runner\./, `${name}: runner context is unavailable in job.env`);
    }
    assert.equal(job.env?.ARTIFACT_DIR, undefined);
    const initialization = job.steps[0];
    assert.match(initialization.run ?? '', /GITHUB_ENV/, `${name}: initialize runtime env before artifact consumers`);
    const environmentFile = path.join(directory, `${name}.env`);
    const runnerTemporary = path.join(directory, 'runner temporary');
    await run('bash', ['-euo', 'pipefail', '-c', initialization.run], { env: { ...process.env, RUNNER_TEMP: runnerTemporary, GITHUB_ENV: environmentFile } });
    assert.equal(await readFile(environmentFile, 'utf8'), `ARTIFACT_DIR=${runnerTemporary}/finder-npm\n`);
  }
});
