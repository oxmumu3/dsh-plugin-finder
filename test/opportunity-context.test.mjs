import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createOpportunityContextReader, OPPORTUNITY_CONTEXT_LIMITS } from '../src/opportunity-context.js';

const code = expected => error => error?.code === expected;
async function fixture(t, options = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'finder-opportunity-context-'));
  const root = await fs.realpath(tmp);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const entity = { id: 'test-workspace', path: root, title: '合成工作区' };
  const requested = [];
  const ctx = { get(name) { requested.push(name); return name === 'workspaceRegistry' ? { get: id => id === entity.id ? entity : undefined } : undefined; } };
  return { root, entity, requested, read: createOpportunityContextReader(ctx, options), write: (name, content) => fs.writeFile(path.join(root, name), content) };
}

test('only explicitly selected registered-workspace text is returned, with byte hash and exact source', async t => {
  const { root, read, write, requested } = await fixture(t);
  const content = '合成资料：\n每次重复整理项目进展。\n';
  await write('brief.md', content); await write('unselected.txt', '不得被选入的其他资料');
  const result = await read({ workspaceId: 'test-workspace', paths: ['brief.md'] });
  assert.equal(result.items.length, 1); assert.equal(result.items[0].text, content);
  assert.equal(result.items[0].id, 'workspace:test-workspace:brief.md');
  assert.deepEqual(result.items[0].source, { workspaceId: 'test-workspace', path: 'brief.md', sha256: createHash('sha256').update(content).digest('hex') });
  assert.equal(result.totalBytes, Buffer.byteLength(content)); assert.equal(result.workspaceTitle, '合成工作区');
  assert.ok(requested.every(name => name === 'workspaceRegistry'));
  assert.ok(!JSON.stringify(result).includes(root));
});

test('no service, unknown workspace or client supplied root cannot select arbitrary disk', async t => {
  const { read, write } = await fixture(t); await write('brief.md', 'safe');
  await assert.rejects(createOpportunityContextReader({ get() {} })({ workspaceId: 'test-workspace', paths: ['brief.md'] }), code('CONTEXT_UNAVAILABLE'));
  await assert.rejects(read({ workspaceId: 'not-registered', paths: ['brief.md'] }), code('CONTEXT_UNAVAILABLE'));
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: ['brief.md'], root: '/etc' }), code('CONTEXT_FILE_BLOCKED'));
});

test('traversal, absolute paths, hidden/credential names, duplicates and unsupported formats fail closed', async t => {
  const { root, read } = await fixture(t);
  for (const selected of ['../outside.md', 'nested/../brief.md', path.join(root, 'brief.md'), 'C:\\secret.txt', '.env', '.git/config', 'credentials.json', 'access-token.txt', 'key.pem', 'brief.pdf', 'a\nb.md']) {
    await assert.rejects(read({ workspaceId: 'test-workspace', paths: [selected] }), code('CONTEXT_FILE_BLOCKED'), selected);
  }
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: ['a.md', 'a.md'] }), code('CONTEXT_FILE_BLOCKED'));
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: [] }), code('CONTEXT_LIMIT'));
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: Array.from({ length: 9 }, (_, i) => `${i}.md`) }), code('CONTEXT_LIMIT'));
  assert.equal(OPPORTUNITY_CONTEXT_LIMITS.maxFiles, 8);
});

test('file and directory symlinks, hardlinks and nonregular files are never read', async t => {
  const { root, read, write } = await fixture(t); await write('real.md', 'safe');
  await fs.symlink(path.join(root, 'real.md'), path.join(root, 'alias.md'));
  await fs.mkdir(path.join(root, 'real-dir')); await fs.writeFile(path.join(root, 'real-dir', 'a.md'), 'safe');
  await fs.symlink(path.join(root, 'real-dir'), path.join(root, 'alias-dir'));
  await fs.link(path.join(root, 'real.md'), path.join(root, 'hard.md'));
  for (const selected of ['alias.md', 'alias-dir/a.md', 'hard.md', 'real-dir']) await assert.rejects(read({ workspaceId: 'test-workspace', paths: [selected] }), code('CONTEXT_FILE_BLOCKED'));
});

test('binary, invalid UTF-8 and credential-shaped content is blocked without reflecting contents', async t => {
  const { read, write } = await fixture(t);
  const contents = [Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe]), '-----BEGIN PRIVATE KEY-----\nnot-a-real-key', 'api_key = "synthetic-secret-value"', 'Bearer abcdefghijklmnopqrstuvwxyz123456', 'API_KEY=synthetic-secret-value'];
  for (const [index, content] of contents.entries()) {
    const name = `sample-${index}.txt`; await write(name, content);
    await assert.rejects(read({ workspaceId: 'test-workspace', paths: [name] }), error => { assert.equal(error.code, 'CONTEXT_FILE_BLOCKED'); assert.ok(!error.message.includes('synthetic-secret')); return true; });
  }
});

test('per-file and aggregate byte caps reject rather than truncate chosen materials', async t => {
  const { read, write } = await fixture(t, { maxFileBytes: 64, maxTotalBytes: 80 });
  await write('large.md', 'x'.repeat(65));
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: ['large.md'] }), code('CONTEXT_LIMIT'));
  await write('a.md', 'a'.repeat(50)); await write('b.md', 'b'.repeat(40));
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: ['a.md', 'b.md'] }), code('CONTEXT_LIMIT'));
  assert.equal((await read({ workspaceId: 'test-workspace', paths: ['a.md'] })).items[0].text.length, 50);
});

test('metadata lists only one level of safe text names/sizes, never content or hidden directories', async t => {
  const { root, read, write } = await fixture(t, { maxEntries: 2 });
  await write('brief.md', 'not-returned-body'); await write('notes.txt', 'other-not-returned');
  await write('.env', 'not-returned'); await write('credentials.json', 'not-returned'); await write('photo.png', Buffer.from([0, 1]));
  await fs.mkdir(path.join(root, 'nested')); await fs.writeFile(path.join(root, 'nested', 'child.md'), 'not-recursively-listed');
  await fs.symlink(path.join(root, 'brief.md'), path.join(root, 'linked.md'));
  const result = await read.metadata({ workspaceId: 'test-workspace' });
  assert.deepEqual(result.files.map(file => file.name), ['brief.md', 'notes.txt']);
  assert.equal(result.truncated, false); assert.equal(result.title, '合成工作区');
  assert.ok(!JSON.stringify(result).includes('not-returned')); assert.ok(result.files.every(file => !('text' in file)));
  assert.deepEqual((await read.metadata({ workspaceId: 'test-workspace', path: 'nested' })).files.map(file => file.path), ['nested/child.md']);
  await write('third.md', 'safe'); assert.equal((await read.metadata({ workspaceId: 'test-workspace' })).truncated, true);
});

test('aborted request and closed lifetime reject before material access', async t => {
  const request = new AbortController(); request.abort();
  const lifetime = new AbortController();
  const { read, write, requested } = await fixture(t, { signal: lifetime.signal }); await write('brief.md', 'safe');
  await assert.rejects(read({ workspaceId: 'test-workspace', paths: ['brief.md'], signal: request.signal }), code('MODEL_ABORTED'));
  assert.equal(requested.length, 0);
  lifetime.abort();
  await assert.rejects(read.metadata({ workspaceId: 'test-workspace' }), code('MODEL_ABORTED'));
  await assert.rejects(read.validateWorkspace({ workspaceId: 'test-workspace' }), code('MODEL_ABORTED'));
});

test('validation binds to registered workspace without reading material or listing files', async t => {
  const { read, write } = await fixture(t); await write('credentials.json', 'should-never-be-opened');
  assert.deepEqual(await read.validateWorkspace({ workspaceId: 'test-workspace' }), { workspaceId: 'test-workspace', title: '合成工作区' });
});

test('root registration changed during an operation rejects instead of returning material', async t => {
  const { root, entity, write } = await fixture(t); await write('brief.md', 'safe');
  let calls = 0;
  const read = createOpportunityContextReader({ get: () => ({ get: () => ++calls === 1 ? entity : { ...entity, path: root + '-changed' } }) });
  await assert.rejects(read({ workspaceId: entity.id, paths: ['brief.md'] }), code('CONTEXT_UNAVAILABLE'));
});


test('metadata work is bounded even when a directory contains only excluded files', async t => {
  const { read, write } = await fixture(t, { maxEntries: 1 });
  for (let i = 0; i < 15; i += 1) await write(`photo-${i}.png`, 'not-text');
  const result = await read.metadata({ workspaceId: 'test-workspace' });
  assert.deepEqual(result.files, []);
  assert.equal(result.truncated, true);
});
