import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';

test('default build emits executable ModuleLoader registration and a working factory', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finder-build-client-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'dsh-plugin-finder' }));
  await writeFile(path.join(directory, 'src/client.js'), 'import React from "react"; export const name = "finder-fixture"; export const apply = () => React.createElement("div");\n');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/build.mjs', import.meta.url))], { cwd: directory });
  const registrations = [];
  vm.runInNewContext(await readFile(path.join(directory, 'dist/client.js'), 'utf8'), { window: { __ModuleLoader__: { load: entry => registrations.push(entry) } } });
  assert.equal(registrations.length, 1); assert.equal(registrations[0].id, 'dsh-plugin-finder');
  const exports = registrations[0].factory(name => {
    assert.equal(name, 'react'); return { createElement: tag => ({ tag }) };
  });
  assert.equal(exports.name, 'finder-fixture'); assert.equal(exports.apply().tag, 'div');
});

test('default buildClient uses the source manifest package name', async t => {
  const { buildClient } = await import(new URL('../scripts/build.mjs', import.meta.url));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finder-manifest-client-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@fixture-owner/finder' }));
  await writeFile(path.join(directory, 'src/client.js'), 'export const value = 42;\n');
  const registrations = [];
  vm.runInNewContext(await buildClient({ sourceRoot: directory }), { window: { __ModuleLoader__: { load: entry => registrations.push(entry) } } });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, '@fixture-owner/finder');
  assert.equal(registrations[0].factory(() => assert.fail('fixture has no imports')).value, 42);
});

test('shared buildClient targets the scoped module without writing output', async t => {
  const filename = new URL('../scripts/build.mjs', import.meta.url);
  assert.match(await readFile(filename, 'utf8'), /export async function buildClient/, 'default and npm builders must share an importable compiler');
  const { buildClient } = await import(filename);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finder-shared-client-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'src/client.js'), 'export const value = 42;\n');
  const registrations = [];
  const client = await buildClient({ sourceRoot: directory, packageName: '@actual-owner/finder' });
  assert.doesNotMatch(client, /finder-shared-client-/, 'build output must not disclose temporary source paths');
  vm.runInNewContext(client, { window: { __ModuleLoader__: { load: entry => registrations.push(entry) } } });
  assert.equal(registrations.length, 1); assert.equal(registrations[0].id, '@actual-owner/finder');
  assert.equal(registrations[0].factory(() => assert.fail('fixture has no imports')).value, 42);
  assert.equal(await readFile(path.join(directory, 'dist/client.js')).catch(() => null), null);
});
