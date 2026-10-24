import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreatorDraft } from '../src/creator-handoff.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const calls = { create: [], retain: [], draft: [], open: [], panels: [], records: [], release: 0 };
  const binding = {
    sessionId: 'creator-session',
    session: { projections: { faceOf: key => ({ getSnapshot: () => key === 'agentPreset' ? 'cordis' : undefined }) } },
    ctx: { get: name => name === 'conversation' ? { input: {
      requestDraftInitialization: (target, options) => { calls.draft.push({ target, options }); return 'applied'; },
    } } : undefined },
  };
  const ctx = {
    sessions: {
      create: async options => { calls.create.push(options); return binding.sessionId; },
      retain: (sessionId, options) => { calls.retain.push({ sessionId, options }); return { binding, ready: Promise.resolve(binding), release: () => { calls.release++; } }; },
      binding: () => binding,
    },
    workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'workspace', sessionIds: [binding.sessionId] }] }) } },
    uiWorkspace: { openSession: sessionId => calls.open.push(sessionId) },
    layout: { selectPanel: panel => calls.panels.push(panel) },
  };
  const options = {
    workspaceId: 'workspace', prompt: 'Build the approved plugin.', hostVersion: '0.2.1-rc.2',
    attempt: { attemptId: 'attempt', acquired: true, status: 'creating' },
    record: async record => { calls.records.push(record); },
    ...overrides,
  };
  return { ctx, options, calls, binding };
}

test('creates one fresh Creator session, saves its identity, verifies and prepares an unsent draft', async () => {
  const f = fixture();
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'applied');
  assert.equal(result.sessionId, 'creator-session');
  assert.deepEqual(f.calls.create, [{ workspaceId: 'workspace', agentPreset: 'cordis' }]);
  assert.deepEqual(f.calls.records.map(row => row.status), ['created', 'applied']);
  assert.equal(f.calls.draft[0].target, f.binding);
  assert.deepEqual(f.calls.draft[0].options, { prompt: f.options.prompt, clearPreviousDraft: false });
  assert.deepEqual(f.calls.open, ['creator-session']);
  assert.deepEqual(f.calls.panels, [null]);
  assert.equal(f.calls.release, 1);
});

test('a duplicate claim cannot create while the winning creation is pending', async () => {
  const f = fixture(); const created = deferred();
  f.ctx.sessions.create = options => { f.calls.create.push(options); return created.promise; };
  const first = prepareCreatorDraft(f.ctx, f.options);
  const second = await prepareCreatorDraft(f.ctx, { ...f.options, attempt: { ...f.options.attempt, acquired: false } });
  assert.equal(second.status, 'in-progress');
  assert.equal(f.calls.create.length, 1);
  created.resolve('creator-session');
  assert.equal((await first).status, 'applied');
});

test('repeated invocation with the same acquired attempt does not duplicate creation', async () => {
  const f = fixture();
  await prepareCreatorDraft(f.ctx, f.options);
  const repeated = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.draft.length, 1);
  assert.equal(repeated.sessionId, 'creator-session');
});

test('known session identity opens only and never creates or overwrites an existing draft', async () => {
  const f = fixture({ attempt: { attemptId: 'attempt', acquired: false, status: 'applied', sessionId: 'creator-session' } });
  assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'opened');
  assert.deepEqual(f.calls.create, []);
  assert.deepEqual(f.calls.draft, []);
  assert.deepEqual(f.calls.open, ['creator-session']);
});

test('an indeterminate attempt without an identity never recreates', async () => {
  const f = fixture({ attempt: { attemptId: 'attempt', acquired: false, status: 'indeterminate' } });
  assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'indeterminate');
  assert.deepEqual(f.calls.create, []);
});

for (const hostVersion of ['0.2.0-rc.2', '0.2.2', '', undefined]) {
  test(`unverified host version ${hostVersion} does not pretend to create a Creator session`, async () => {
    const f = fixture({ hostVersion });
    assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'unsupported');
    assert.deepEqual(f.calls.create, []);
    assert.deepEqual(f.calls.draft, []);
  });
}

test('a wrong preset blocks injection after saving the actual created identity', async () => {
  const f = fixture();
  f.binding.session.projections.faceOf = () => ({ getSnapshot: () => 'default' });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'preset-mismatch');
  assert.equal(result.sessionId, 'creator-session');
  assert.deepEqual(f.calls.draft, []);
  assert.deepEqual(f.calls.open, []);
  assert.equal(f.calls.records[0].sessionId, 'creator-session');
  assert.equal(f.calls.release, 1);
});

test('a superseded binding blocks injection and releases the retained reference', async () => {
  const f = fixture();
  f.ctx.sessions.binding = () => ({ ...f.binding });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'binding-changed');
  assert.deepEqual(f.calls.draft, []);
  assert.equal(f.calls.release, 1);
});

test('an unverified workspace owner blocks injection without losing the identity', async () => {
  const f = fixture();
  f.ctx.workspaces.list.getSnapshot = () => ({ phase: 'ready', items: [{ workspaceId: 'other', sessionIds: ['creator-session'] }] });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'workspace-mismatch');
  assert.equal(result.sessionId, 'creator-session');
  assert.deepEqual(f.calls.draft, []);
});

test('cancelled creation returns promptly but its later actual identity is still recorded', async () => {
  const f = fixture(); const created = deferred(); const controller = new AbortController();
  f.ctx.sessions.create = () => created.promise;
  const pending = prepareCreatorDraft(f.ctx, { ...f.options, signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  created.resolve('creator-session');
  const completed = await result.completion;
  assert.equal(completed.sessionId, 'creator-session');
  assert.equal(f.calls.records.at(-1).sessionId, 'creator-session');
  assert.deepEqual(f.calls.draft, []);
  assert.deepEqual(f.calls.open, []);
  assert.deepEqual(f.calls.retain, []);
});

test('cancelled retain waits do not inject, and release the reference', async () => {
  const f = fixture(); const ready = deferred(); const controller = new AbortController();
  f.ctx.sessions.retain = () => { controller.abort(); return { binding: f.binding, ready: ready.promise, release: () => f.calls.release++ }; };
  const result = await prepareCreatorDraft(f.ctx, { ...f.options, signal: controller.signal });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.sessionId, 'creator-session');
  assert.equal(f.calls.release, 1);
  assert.deepEqual(f.calls.draft, []);
});

test('page disposal after creation records the real identity without injecting or navigating', async () => {
  const f = fixture(); let current = true;
  f.ctx.sessions.create = async () => { current = false; return 'creator-session'; };
  const result = await prepareCreatorDraft(f.ctx, { ...f.options, stillCurrent: () => current });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.sessionId, 'creator-session');
  assert.equal(f.calls.records[0].sessionId, 'creator-session');
  assert.deepEqual(f.calls.draft, []);
  assert.deepEqual(f.calls.open, []);
});

test('SessionCreateError workspace attach failure saves its nested real identity without injection', async () => {
  const f = fixture();
  f.ctx.sessions.create = async () => { throw Object.assign(new Error('wrapped'), { name: 'SessionCreateError', rpcError: { code: 'session/workspace-attach-failed', details: { sessionId: 'detached-session' } } }); };
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'attach-failed');
  assert.equal(result.sessionId, 'detached-session');
  assert.equal(f.calls.records[0].status, 'attach-failed');
  assert.equal(f.calls.records[0].sessionId, 'detached-session');
  assert.deepEqual(f.calls.draft, []);
  assert.deepEqual(f.calls.open, []);
});

test('transport failure without an identity remains indeterminate and cannot be retried as uncreated', async () => {
  const f = fixture();
  f.ctx.sessions.create = async options => { f.calls.create.push(options); throw new Error('connection closed'); };
  assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'indeterminate');
  assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'indeterminate');
  assert.equal(f.calls.create.length, 1);
});

for (const draftStatus of ['preserved', 'blocked']) {
  test(`${draftStatus} drafts and attachments are preserved without navigation or submission`, async () => {
    const f = fixture();
    f.binding.ctx.get = () => ({ input: { requestDraftInitialization: (_binding, options) => {
      assert.equal(options.clearPreviousDraft, false); return draftStatus;
    } } });
    assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, draftStatus);
    assert.deepEqual(f.calls.open, []);
    assert.deepEqual(f.calls.panels, []);
  });
}

test('failed identity persistence keeps a recoverable ID and blocks draft injection', async () => {
  const f = fixture({ record: async () => { throw new Error('disk full'); } });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'record-failed');
  assert.equal(result.operationStatus, 'created');
  assert.equal(result.sessionId, 'creator-session');
  assert.deepEqual(result.recoveryRecord, { attemptId: 'attempt', status: 'created', sessionId: 'creator-session' });
  assert.deepEqual(f.calls.draft, []);
  await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(f.calls.create.length, 1);
});

test('persistence failure after applying a draft exposes save-only recovery without reinjecting', async () => {
  const f = fixture();
  f.options.record = async record => { f.calls.records.push(record); if (record.status === 'applied') throw new Error('disk full'); };
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'record-failed');
  assert.equal(result.operationStatus, 'applied');
  assert.equal(result.sessionId, 'creator-session');
  assert.equal(result.recoveryRecord.status, 'applied');
  await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.draft.length, 1);
});

test('late identity save failure remains inspectable through cancellation completion', async () => {
  const f = fixture({ record: async () => { throw new Error('disk full'); } });
  const created = deferred(); const controller = new AbortController();
  f.ctx.sessions.create = () => created.promise;
  const pending = prepareCreatorDraft(f.ctx, { ...f.options, signal: controller.signal });
  controller.abort();
  const result = await pending;
  created.resolve('creator-session');
  const completed = await result.completion;
  assert.equal(completed.status, 'record-failed');
  assert.equal(completed.sessionId, 'creator-session');
  assert.equal(completed.recoveryRecord.sessionId, 'creator-session');
});

test('an already cancelled operation creates nothing', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  assert.equal((await prepareCreatorDraft(f.ctx, { ...f.options, signal: controller.signal })).status, 'cancelled');
  assert.deepEqual(f.calls.create, []);
});

test('identity persistence must settle successfully before retaining or initializing the session', async () => {
  const f = fixture(); const saved = deferred(); const recording = deferred();
  f.options.record = async record => {
    if (record.status === 'created') { recording.resolve(); await saved.promise; }
    f.calls.records.push(record);
  };
  const pending = prepareCreatorDraft(f.ctx, f.options);
  await recording.promise;
  assert.deepEqual(f.calls.retain, []);
  assert.deepEqual(f.calls.draft, []);
  saved.resolve();
  assert.equal((await pending).status, 'applied');
});

test('an existing attach-failed identity can be opened without implying attachment succeeded', async () => {
  const f = fixture({ attempt: { attemptId: 'attempt', acquired: false, status: 'attach-failed', sessionId: 'detached-session' } });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'opened');
  assert.equal(result.operationStatus, 'attach-failed');
  assert.deepEqual(f.calls.open, ['detached-session']);
  assert.deepEqual(f.calls.records, []);
  assert.deepEqual(f.calls.create, []);
  assert.deepEqual(f.calls.draft, []);
});

test('cancellation during applied-state persistence keeps saving without late navigation', async () => {
  const f = fixture(); const saved = deferred(); const recording = deferred(); const controller = new AbortController();
  f.options.record = async record => {
    if (record.status === 'applied') { recording.resolve(); await saved.promise; }
    f.calls.records.push(record);
  };
  const pending = prepareCreatorDraft(f.ctx, { ...f.options, signal: controller.signal });
  await recording.promise; controller.abort();
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.operationStatus, 'applied');
  assert.equal(result.sessionId, 'creator-session');
  saved.resolve();
  assert.equal((await result.completion).status, 'applied');
  assert.equal(f.calls.records.at(-1).status, 'applied');
  assert.deepEqual(f.calls.open, []);
});

test('missing persistence or a mismatching claimed workspace cannot create', async () => {
  for (const overrides of [{ record: undefined }, { attempt: { attemptId: 'attempt', acquired: true, status: 'creating', workspaceId: 'different' } }]) {
    const f = fixture(overrides);
    assert.equal((await prepareCreatorDraft(f.ctx, f.options)).status, 'blocked');
    assert.deepEqual(f.calls.create, []);
  }
});

test('errors releasing a retained reference do not hide a saved Creator identity', async () => {
  const f = fixture();
  f.ctx.sessions.retain = () => ({ binding: f.binding, ready: Promise.resolve(f.binding), release: () => { throw new Error('already disposed'); } });
  const result = await prepareCreatorDraft(f.ctx, f.options);
  assert.equal(result.status, 'applied');
  assert.equal(result.sessionId, 'creator-session');
});
