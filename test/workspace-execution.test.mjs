import test from 'node:test';
import assert from 'node:assert/strict';
import { executeInWorkspace, inferWorkspace } from '../src/workspace-execution.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of [...listeners]) fn(); }, get listenerCount() { return listeners.size; } };
}
function fixture(extra = {}) {
  const calls = { create: [], prompt: [], cancel: 0, remove: [], records: [], claims: [], cancellationClaims: [], mounted: 0, released: 0 };
  const state = observable({ running: false, openState: 'open', blank: true });
  const events = observable({ entries: [], hasMore: false });
  const inbox = observable({ 'next-turn': [], 'next-step': [] });
  const status = observable(new Map());
  const workspace = observable({ phase: 'ready', items: [{ workspaceId: 'ws', title: 'Current', sessionIds: ['main', 'exec'] }] });
  const binding = { sessionId: 'exec', eventSource: events, session: {
    ...state, projections: { faceOf: key => key === 'inbox' ? inbox : observable('standard') },
    prompt: async (...args) => { calls.prompt.push(args); return { ok: true, value: { accepted: true } }; },
    cancel: async () => { calls.cancel++; return { ok: true, value: { accepted: true } }; },
    updateQueue: async (...args) => { calls.remove.push(args); return { ok: true, value: { accepted: true } }; },
  } };
  const ctx = {
    sessions: { list: observable({ phase: 'ready', byId: { main: { id: 'main', retainedBy: { mainView: 1 } } } }),
      create: async args => { calls.create.push(args); return 'exec'; },
      retain: () => ({ sessionId: 'exec', binding, ready: Promise.resolve(binding), release: () => { calls.released++; } }),
      binding: () => binding }, workspaces: { list: workspace }, uiSession: { sessionStatus: status },
  };
  const attempt = { attemptId: 'attempt', requestId: 'request', taskId: 'task', revisionId: 'revision', kind: 'use', workspaceId: 'ws', status: 'claimed', provenance: 'local', prompt: 'Do the approved task.' };
  const options = { attempt, acquired: true, prepareExecution: async row => ({ready:true,attempt:{...attempt,...row,status:'created'}}), record: async row => { calls.records.push(row); return { ...row }; }, claimSubmission: async row => { calls.claims.push(row); return { claim: 'acquired', attempt: { ...attempt, ...row, status: 'submitting' } }; }, claimCancellation: async row => { calls.cancellationClaims.push(row); return { claim: 'acquired', attempt: { ...attempt, ...row, status: 'cancelled' } }; }, onReference: async () => { calls.mounted++; }, ...extra };
  return { ctx, options, attempt, calls, binding, state, events, inbox, status, workspace };
}
const event = (type, data, seq) => ({ type: 'event', event: { type, data, seq } });
const user = (requestId = 'request') => ({ id: 'message', source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: 'request' }] });
const turnEvents = (reason = 'completed', requestId = 'request') => [
  event('turn/start', { turn: 1 }, 1), event('user/message', user(requestId), 2),
  event('step/start', { turn: 1, step: 1 }, 3),
  event('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'Actual result' }] } }, 4),
  event('turn/end', { turn: 1, reason: { kind: reason } }, 5),
];
const tick = () => new Promise(resolve => setImmediate(resolve));

test('workspace inference uses mainView ownership and refuses ambiguous selection', () => {
  const f = fixture();
  assert.equal(inferWorkspace(f.ctx).workspaceId, 'ws');
  assert.equal(inferWorkspace(f.ctx).source, 'current-session');
  assert.equal(inferWorkspace(f.ctx, 'other').source, 'current-session');
  f.ctx.sessions.list.set({ phase: 'ready', byId: {} });
  assert.equal(inferWorkspace(f.ctx).source, 'only-workspace');
  f.workspace.set({ phase: 'ready', items: [{ workspaceId: 'ws', sessionIds: [] }, { workspaceId: 'other', sessionIds: [] }] });
  assert.equal(inferWorkspace(f.ctx).workspaceId, '');
  assert.equal(inferWorkspace(f.ctx, 'other').source, 'selected');
});

test('fresh execution persists exact ID, mounts official UI, then sends fixed request once without navigation', async () => {
  const f = fixture(); const mounted = deferred();
  f.options.onReference = () => mounted.promise;
  const run = executeInWorkspace(f.ctx, f.options);
  await tick(); assert.equal(f.calls.prompt.length, 0);
  mounted.resolve(); const h = await run;
  assert.deepEqual(f.calls.create, [{ workspaceId: 'ws', agentPreset: 'standard' }]);
  assert.deepEqual(f.calls.records.map(x => x.status), ['created', 'submitted']);
  assert.equal(f.calls.claims.length, 1);
  assert.equal(f.calls.prompt[0][3], 'request');
  assert.equal(h.getSnapshot().phase, 'submitted');
  assert.equal(h.getSnapshot().terminal, false);
  await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.prompt.length, 1);
  h.dispose();
});

test('read-only existing/imported association reconnects and observes without sending or recording', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted', provenance: 'imported' };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.create.length, 0); assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.records.length, 0);
  f.events.set({ entries: turnEvents(), hasMore: false });
  assert.equal(h.getSnapshot().phase, 'completed'); assert.equal(h.getSnapshot().result, 'Actual result');
  assert.equal((await h.completion).terminal, true); h.dispose();
});

test('existing execution reads bounded older pages until its exact request and turn are recovered', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' };
  const tail = [event('turn/start', { turn: 99 }, 99), event('user/message', user('unrelated'), 100)];
  f.events.set({ entries: tail, hasMore: true }); f.state.set({ running: true, openState: 'open' });
  let pages = 0;
  f.binding.session.loadOlder = async (...args) => {
    assert.equal(args.length, 0); pages++;
    f.events.set({ entries: pages === 1 ? [event('turn/end', { turn: 20, reason: { kind: 'completed' } }, 70), ...tail] : [...turnEvents(), ...tail], hasMore: pages < 2 });
  };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(pages, 2); assert.equal(h.getSnapshot().phase, 'completed'); assert.equal(h.getSnapshot().result, 'Actual result');
  assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.create.length, 0); assert.equal(f.calls.cancel, 0); h.dispose();
});

test('history recovery stops at five pages and missing request remains unknown despite other running work', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' };
  let pages = 0;
  f.events.set({ entries: [event('turn/start', { turn: 99 }, 99), event('user/message', user('unrelated'), 100)], hasMore: true });
  f.state.set({ running: true, openState: 'open' });
  f.binding.session.loadOlder = async () => {
    pages++; f.events.set({ entries: [event('turn/end', { turn: 90 - pages, reason: { kind: 'completed' } }, 90 - pages), ...f.events.getSnapshot().entries], hasMore: true });
  };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(pages, 5); assert.equal(h.getSnapshot().phase, 'unknown'); assert.equal(h.getSnapshot().terminal, false);
  await h.cancel(); assert.equal(f.calls.cancel, 0); assert.equal(f.calls.prompt.length, 0); h.dispose();
});

test('history recovery stops after an unchanged window and never guesses a result', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' };
  f.events.set({ entries: turnEvents('completed', 'unrelated'), hasMore: true }); let pages = 0;
  f.binding.session.loadOlder = async () => { pages++; };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(pages, 1); assert.equal(h.getSnapshot().phase, 'unknown'); assert.equal(h.getSnapshot().terminal, false); h.dispose();
});

test('existing attempt with no session never creates, even if acquired was accidentally repeated', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, status: 'submitting' };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.create.length, 0); assert.equal(f.calls.prompt.length, 0); assert.equal(h.getSnapshot().phase, 'unknown'); h.dispose();
});

test('source-bound progress waits for the matching request and a durable turn end', async () => {
  const f = fixture(); const h = await executeInWorkspace(f.ctx, f.options);
  f.events.set({ entries: turnEvents('completed', 'some-other-request'), hasMore: false });
  assert.notEqual(h.getSnapshot().phase, 'completed');
  f.events.set({ entries: turnEvents().slice(0, 4), hasMore: false });
  assert.equal(h.getSnapshot().terminal, false);
  f.events.set({ entries: turnEvents(), hasMore: false });
  assert.equal(h.getSnapshot().phase, 'completed'); h.dispose();
});

test('official pending interaction is reported as waiting for user, never auto-answered', async () => {
  const f = fixture(); const h = await executeInWorkspace(f.ctx, f.options);
  f.status.set(new Map([['exec', { pendingInteraction: { domain: 'approval' } }]]));
  assert.equal(h.getSnapshot().phase, 'waiting-user'); assert.equal(h.getSnapshot().terminal, false); h.dispose();
});

test('cancel acknowledgement is not completion and exact durable abort confirms cancellation', async () => {
  const f = fixture(); const h = await executeInWorkspace(f.ctx, f.options);
  f.events.set({ entries: turnEvents().slice(0, 3), hasMore: false });
  const cancelled = await h.cancel();
  assert.equal(cancelled.accepted, true); assert.equal(h.getSnapshot().phase, 'cancelling'); assert.equal(h.getSnapshot().terminal, false);
  f.events.set({ entries: turnEvents('aborted'), hasMore: false });
  assert.equal(h.getSnapshot().phase, 'cancelled'); assert.equal((await h.completion).terminal, true); h.dispose();
});

test('structured abort reasons do not become object strings in the stopped execution details', async () => {
  const f = fixture(), handle = await executeInWorkspace(f.ctx, f.options);
  const entries = turnEvents('aborted');
  entries.at(-1).event.data.reason = { kind: 'aborted', reason: { kind: 'user', internal: 'PRIVATE_ABORT_OBJECT' } };
  f.events.set({ entries, hasMore: false });
  assert.equal(handle.getSnapshot().phase, 'cancelled');
  assert.equal(handle.getSnapshot().details, '');
  assert.doesNotMatch(handle.getSnapshot().details, /\[object Object\]|PRIVATE_/); handle.dispose();
});

test('structured execution errors retain readable messages without dumping internal objects', async () => {
  for (const [error, expected] of [
    [{ message: '模型连接暂时不可用', internal: 'PRIVATE_ERROR_OBJECT' }, '模型连接暂时不可用'],
    [{ rpcError: { message: '当前请求被宿主拒绝', credentials: 'PRIVATE_RPC_OBJECT' } }, '当前请求被宿主拒绝'],
    [{ message: { internal: 'PRIVATE_MESSAGE_OBJECT' }, code: { internal: 'PRIVATE_CODE_OBJECT' } }, '宿主未提供可读错误详情。'],
  ]) {
    const f = fixture(), handle = await executeInWorkspace(f.ctx, f.options), entries = turnEvents('error');
    entries.at(-1).event.data.reason = { kind: 'error', error };
    f.events.set({ entries, hasMore: false });
    assert.equal(handle.getSnapshot().phase, 'failed');assert.equal(handle.getSnapshot().details, expected);
    assert.doesNotMatch(handle.getSnapshot().details, /\[object Object\]|PRIVATE_/); handle.dispose();
  }
});

test('cancel before prompt acceptance removes only the later exact queued occurrence and waits for evidence', async () => {
  const f = fixture(); const admission = deferred();
  f.binding.session.prompt = (...args) => { f.calls.prompt.push(args); return admission.promise; };
  const abort = new AbortController(); f.options.signal = abort.signal;
  const run = executeInWorkspace(f.ctx, f.options); await tick(); abort.abort();
  const h = await run;
  const own = user(); const other = { ...user('other'), id: 'unrelated' };
  f.inbox.set({ 'next-turn': [own, other], 'next-step': [] }); await tick();
  assert.deepEqual(f.calls.remove, [['message', { kind: 'remove' }]]);
  assert.equal(h.getSnapshot().terminal, false);
  admission.resolve({ ok: true, value: { accepted: true } }); await h.ready;
  assert.equal(h.getSnapshot().phase, 'cancelling');
  f.events.set({ entries: [event('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own] }, 1), event('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' }, 2)], hasMore: false });
  f.inbox.set({ 'next-turn': [other], 'next-step': [] }); await tick();
  assert.equal(h.getSnapshot().phase, 'cancelled'); h.dispose();
});

test('late creation after cancellation still persists sessionId and never submits', async () => {
  const f = fixture(); const created = deferred(); const abort = new AbortController();
  f.ctx.sessions.create = () => created.promise; f.options.signal = abort.signal;
  const run = executeInWorkspace(f.ctx, f.options); await tick(); abort.abort();
  const h = await run; assert.equal(h.getSnapshot().phase, 'cancelling');
  created.resolve('exec'); await h.ready;
  assert.equal(h.sessionId, 'exec'); assert.equal(f.calls.records.find(x => x.status === 'created').sessionId, 'exec');
  assert.equal(h.getSnapshot().phase, 'cancelled'); assert.equal(f.calls.cancellationClaims.length, 1);
  assert.equal(f.calls.prompt.length, 0); h.dispose();
});

test('binding/preset mismatch and UI mount failure preserve created identity without sending', async () => {
  for (const mode of ['binding', 'preset', 'mount']) {
    const f = fixture();
    if (mode === 'binding') f.ctx.sessions.binding = () => ({ ...f.binding });
    if (mode === 'preset') f.binding.session.projections.faceOf = () => observable('wrong');
    if (mode === 'mount') f.options.onReference = async () => { throw new Error('official UI unavailable'); };
    const h = await executeInWorkspace(f.ctx, f.options);
    assert.equal(f.calls.prompt.length, 0); assert.equal(h.sessionId, 'exec'); assert.equal(h.getSnapshot().phase, 'blocked'); h.dispose();
  }
});

test('created record failure prevents send and exposes save-only recovery', async () => {
  const f = fixture(); f.options.record = async row => { f.calls.records.push(row); if (row.status === 'created') throw new Error('disk full'); return { ...row }; };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.prompt.length, 0); assert.equal(h.getSnapshot().phase, 'record-failed'); assert.equal(h.recoveryRecord.status, 'created'); h.dispose();
});

test('unknown prompt result remains submitting, never failed and never automatically resent', async () => {
  const f = fixture(); f.binding.session.prompt = async (...args) => { f.calls.prompt.push(args); throw new Error('connection lost'); };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(h.getSnapshot().phase, 'unknown'); assert.equal(f.calls.records.at(-1).status, 'submitting');
  await executeInWorkspace(f.ctx, f.options); assert.equal(f.calls.prompt.length, 1);
  f.events.set({ entries: turnEvents(), hasMore: false }); assert.equal(h.getSnapshot().phase, 'completed'); h.dispose();
});

test('workspace attach error preserves actual identity and blocks execution', async () => {
  const f = fixture(); f.ctx.sessions.create = async () => { throw { rpcError: { code: 'session/workspace-attach-failed', details: { sessionId: 'detached' } } }; };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(h.sessionId, 'detached'); assert.equal(f.calls.records[0].sessionId, 'detached'); assert.equal(f.calls.prompt.length, 0); assert.equal(h.getSnapshot().phase, 'blocked'); h.dispose();
});

test('dispose releases monitoring exactly once without cancelling Host execution', async () => {
  const f = fixture(); const h = await executeInWorkspace(f.ctx, f.options); h.dispose(); h.dispose();
  assert.equal(f.calls.released, 1); assert.equal(f.calls.cancel, 0); assert.equal(f.events.listenerCount, 0);
});

test('canonical cancelled/submitted save response revokes submission authority', async () => {
  for (const status of ['cancelled', 'submitted']) {
    const f = fixture(); f.options.record = async row => ({ ...row, status: row.status === 'created' ? status : row.status });
    const h = await executeInWorkspace(f.ctx, f.options);
    assert.equal(f.calls.prompt.length, 0);
    assert.equal(h.getSnapshot().phase, status === 'submitted' ? 'submitted' : 'cancelled'); h.dispose();
  }
});

test('a missing canonical save acknowledgement cannot authorize prompt', async () => {
  const f = fixture(); f.options.record = async () => undefined;
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.prompt.length, 0); assert.equal(h.getSnapshot().phase, 'record-failed'); h.dispose();
});

test('existing preparation state with no durable request evidence is unknown, not a new execution', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitting' }; f.options.acquired = false;
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(h.getSnapshot().phase, 'unknown'); assert.equal(f.calls.prompt.length, 0); h.dispose();
});

test('cancellation recorded by another tab after prompt cannot be presented as stopped', async () => {
  const f = fixture(); f.options.record = async row => ({ ...row, status: row.status === 'submitted' ? 'cancelled' : row.status });
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(f.calls.prompt.length, 1); assert.equal(h.getSnapshot().terminal, false);
  assert.equal(h.getSnapshot().phase, 'cancelling');
  f.events.set({ entries: turnEvents().slice(0, 3), hasMore: false }); await tick(); assert.ok(f.calls.cancel > 0); h.dispose();
});

test('closing while UI mount is pending prevents submission, retaining the real session identity', async () => {
  const f = fixture(); const mounted = deferred(); const abort = new AbortController(); let early;
  f.options.signal = abort.signal; f.options.onReference = () => mounted.promise; f.options.onHandle = handle => { early = handle; };
  const run = executeInWorkspace(f.ctx, f.options); await tick(); early.dispose(); abort.abort('disposed');
  const h = await run; mounted.resolve(); await h.ready;
  assert.equal(f.calls.prompt.length, 0); assert.equal(h.sessionId, 'exec'); assert.equal(f.calls.released, 1);
  assert.deepEqual(f.calls.records.map(row => row.status), ['created']); assert.equal(f.calls.claims.length, 0);
});

test('cancelling an existing session during retain waits for binding readiness then cancels without mounting', async () => {
  const f = fixture(); const opened = deferred(); const abort = new AbortController();
  f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' }; f.options.acquired = false; f.options.signal = abort.signal;
  f.events.set({ entries: turnEvents().slice(0, 3), hasMore: false });
  f.ctx.sessions.retain = () => ({ sessionId: 'exec', binding: f.binding, ready: opened.promise, release: () => { f.calls.released++; } });
  const run = executeInWorkspace(f.ctx, f.options); await tick(); abort.abort(); const h = await run;
  assert.equal(f.calls.cancel, 0); assert.equal(f.calls.mounted, 0);
  opened.resolve(f.binding); await h.ready; await tick();
  assert.ok(f.calls.cancel > 0); assert.equal(f.calls.mounted, 0); assert.equal(h.getSnapshot().terminal, false); h.dispose();
});

test('cancelling our queued request never interrupts an unrelated active turn', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' }; f.options.acquired = false;
  f.state.set({ running: true, openState: 'open', blank: false });
  f.events.set({ entries: [event('turn/start', { turn: 99 }, 1), event('user/message', user('unrelated-request'), 2)], hasMore: false });
  f.inbox.set({ 'next-turn': [user()], 'next-step': [] });
  const h = await executeInWorkspace(f.ctx, f.options); await h.cancel();
  assert.deepEqual(f.calls.remove, [['message', { kind: 'remove' }]]);
  assert.equal(f.calls.cancel, 0); assert.equal(h.getSnapshot().terminal, false); h.dispose();
});

test('official runtime, skill and time context messages do not revoke ownership of our active request', async () => {
  const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' }; f.options.acquired = false;
  f.state.set({ running: true, openState: 'open', blank: false });
  const entries = [event('turn/start', { turn: 1 }, 7), event('user/message', user(), 8),
    ...['runtime-context', 'skill-catalog', 'time-context'].map((kind, index) => event('user/message', { source: { kind }, content: [{ type: 'text', text: 'Host-provided context' }] }, 9 + index))];
  f.events.set({ entries, hasMore: false });
  const h = await executeInWorkspace(f.ctx, f.options); await h.cancel();
  assert.equal(f.calls.cancel, 1); assert.equal(h.getSnapshot().terminal, false);
  f.events.set({ entries: [...entries, event('turn/end', { turn: 1, reason: { kind: 'aborted' } }, 12)], hasMore: false });
  assert.equal(h.getSnapshot().phase, 'cancelled'); assert.equal(h.getSnapshot().terminal, true); h.dispose();
});

test('a second real user with another or missing requestId still blocks whole-turn cancellation', async () => {
  for (const source of [{ kind: 'user', rpcId: 'unrelated-request' }, { kind: 'user' }]) {
    const f = fixture(); f.options.attempt = { ...f.attempt, sessionId: 'exec', status: 'submitted' }; f.options.acquired = false;
    f.state.set({ running: true, openState: 'open', blank: false });
    f.events.set({ entries: [event('turn/start', { turn: 1 }, 1), event('user/message', user(), 2), event('user/message', { ...user(), source }, 3)], hasMore: false });
    const h = await executeInWorkspace(f.ctx, f.options); await h.cancel();
    assert.equal(f.calls.cancel, 0); assert.equal(h.getSnapshot().terminal, false); h.dispose();
  }
});

test('mount failure preserves created association and explicit continuation sends once in the same session', async () => {
  const f = fixture(); f.options.onReference = async () => { throw new Error('temporary mount failure'); };
  const first = await executeInWorkspace(f.ctx, f.options); first.dispose();
  assert.equal(f.calls.claims.length, 0); assert.equal(f.calls.prompt.length, 0);
  const attempt = { ...f.attempt, status: 'created', sessionId: 'exec' };
  const observed = await executeInWorkspace(f.ctx, { ...f.options, attempt, acquired: false, onReference: async () => {} });
  assert.equal(observed.getSnapshot().canContinue, true); assert.equal(f.calls.claims.length, 0); observed.dispose();
  const resumed = await executeInWorkspace(f.ctx, { ...f.options, attempt, acquired: false, allowSubmit: true, onReference: async () => {} });
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.claims.length, 1); assert.equal(f.calls.prompt.length, 1);
  assert.equal(f.calls.prompt[0][3], 'request'); assert.equal(resumed.sessionId, 'exec'); resumed.dispose();
});

test('concurrent created continuations use the server atomic grant and only its winner sends', async () => {
  const f = fixture(); let granted = false;
  const options = { ...f.options, acquired: false, allowSubmit: true, attempt: { ...f.attempt, status: 'created', sessionId: 'exec' }, claimSubmission: async row => {
    const claim = granted ? 'existing' : 'acquired'; granted = true;
    return { claim, attempt: { ...f.attempt, ...row, status: 'submitting', prompt: 'Canonical resumed request' } };
  } };
  const handles = await Promise.all([executeInWorkspace(f.ctx, options), executeInWorkspace(f.ctx, options)]);
  assert.equal(f.calls.create.length, 0); assert.equal(f.calls.prompt.length, 1); assert.equal(f.calls.prompt[0][0][0].text, 'Canonical resumed request');
  for (const handle of handles) handle.dispose();
});

test('a lost atomic submission grant is unknown and is never requested again automatically', async () => {
  const f = fixture(); f.options.claimSubmission = async () => { f.calls.claims.push({}); throw new Error('response lost'); };
  const h = await executeInWorkspace(f.ctx, f.options);
  assert.equal(h.getSnapshot().phase, 'unknown'); assert.equal(f.calls.prompt.length, 0); assert.equal(h.recoveryRecord, undefined);
  await executeInWorkspace(f.ctx, f.options); assert.equal(f.calls.claims.length, 1); h.dispose();
});

test('early handle disposal while prompt response is pending detaches before a close abort can cancel', async () => {
  const f = fixture(), pending = deferred(), abort = new AbortController(); let early;
  f.options.signal = abort.signal; f.options.onHandle = handle => { early = handle; };
  f.binding.session.prompt = async (...args) => { f.calls.prompt.push(args); f.events.set({ entries: turnEvents().slice(0, 3), hasMore: false }); return pending.promise; };
  const run = executeInWorkspace(f.ctx, f.options); await tick();
  assert.ok(early); early.dispose(); abort.abort('disposed');
  const h = await run; await tick(); assert.equal(f.calls.cancel, 0); assert.equal(f.calls.released, 1);
  pending.resolve({ ok: true, value: { accepted: true } }); await h.ready; assert.equal(f.calls.cancel, 0);
});

test('closing during creation saves the late session as created for explicit continuation', async () => {
  const f = fixture(), pending = deferred(), abort = new AbortController(); let early;
  f.options.signal = abort.signal; f.options.onHandle = handle => { early = handle; };
  f.ctx.sessions.create = async args => { f.calls.create.push(args); return pending.promise; };
  const run = executeInWorkspace(f.ctx, f.options); early.dispose(); abort.abort('disposed');
  const h = await run; pending.resolve('exec'); await h.ready;
  assert.deepEqual(f.calls.records.map(row => row.status), ['created']); assert.equal(h.sessionId, 'exec');
  assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.claims.length, 0); assert.equal(f.calls.cancel, 0);
  const observed = await executeInWorkspace(f.ctx, { ...f.options, signal: undefined, onHandle: undefined, acquired: false, attempt: { ...f.attempt, status: 'created', sessionId: 'exec' } });
  assert.equal(observed.getSnapshot().canContinue, true); observed.dispose();
});

test('closing during an atomic submission claim preserves submitting and never sends or relabels it cancelled', async () => {
  const f = fixture(), pending = deferred(), abort = new AbortController(); let early;
  f.options.signal = abort.signal; f.options.onHandle = handle => { early = handle; };
  f.options.claimSubmission = async row => { f.calls.claims.push(row); return pending.promise; };
  const run = executeInWorkspace(f.ctx, f.options); await tick(); assert.equal(f.calls.claims.length, 1);
  early.dispose(); abort.abort('disposed'); const h = await run;
  const attempt = { ...f.attempt, ...f.calls.claims[0], status: 'submitting' };
  pending.resolve({ claim: 'acquired', attempt }); await h.ready;
  assert.deepEqual(f.calls.records.map(row => row.status), ['created']); assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.cancel, 0);
  const observed = await executeInWorkspace(f.ctx, { ...f.options, signal: undefined, onHandle: undefined, acquired: false, allowSubmit: true, attempt });
  assert.equal(observed.getSnapshot().phase, 'unknown'); assert.equal(observed.getSnapshot().canContinue, false);
  assert.equal(f.calls.claims.length, 1); assert.equal(f.calls.prompt.length, 0); observed.dispose();
});

test('explicit stop during restored created UI mounting atomically cancels preparation without sending', async () => {
  const f = fixture(), mounted = deferred(); let early;
  const attempt = { ...f.attempt, sessionId: 'exec', status: 'created' };
  const run = executeInWorkspace(f.ctx, { ...f.options, attempt, acquired: false, allowSubmit: true,
    onReference: () => mounted.promise, onHandle: handle => { early = handle; } });
  await tick(); const stopped = await early.cancel(); mounted.resolve(); const handle = await run;
  assert.equal(stopped.confirmed, true); assert.equal(handle.getSnapshot().phase, 'cancelled'); assert.equal(handle.getSnapshot().terminal, true);
  assert.deepEqual(f.calls.cancellationClaims, [{ attemptId: 'attempt', requestId: 'request', taskId: 'task', revisionId: 'revision', kind: 'use', workspaceId: 'ws', sessionId: 'exec' }]);
  assert.equal(f.calls.claims.length, 0); assert.equal(f.calls.records.length, 0); assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.cancel, 0); handle.dispose();
});

test('a competing submission beats pre-send cancellation without cancelling an unrelated active turn', async () => {
  const f = fixture(), opened = deferred(); let early;
  const attempt = { ...f.attempt, sessionId: 'exec', status: 'created' };
  f.ctx.sessions.retain = () => ({ binding: f.binding, ready: opened.promise, release() {} });
  f.state.set({ running: true, openState: 'open' });
  f.events.set({ entries: [event('turn/start', { turn: 9 }, 1), event('user/message', user('unrelated'), 2)], hasMore: false });
  const run = executeInWorkspace(f.ctx, { ...f.options, attempt, acquired: false, allowSubmit: true,
    onHandle: handle => { early = handle; }, claimCancellation: async row => { f.calls.cancellationClaims.push(row); return { claim: 'existing', attempt: { ...attempt, status: 'submitting' } }; } });
  await tick(); const stopped = await early.cancel(); opened.resolve(f.binding); const handle = await run;
  assert.equal(stopped.accepted, false); assert.equal(handle.getSnapshot().terminal, false);
  assert.equal(f.calls.records.length, 0); assert.equal(f.calls.prompt.length, 0); assert.equal(f.calls.claims.length, 0); assert.equal(f.calls.cancel, 0);
  f.events.set({ entries: [...f.events.getSnapshot().entries, event('turn/end', { turn: 9, reason: { kind: 'completed' } }, 3), ...turnEvents().slice(0, 3)], hasMore: false });
  await tick(); assert.equal(f.calls.cancel, 1); assert.equal(handle.getSnapshot().terminal, false);
  f.events.set({ entries: turnEvents('aborted'), hasMore: false }); assert.equal(handle.getSnapshot().phase, 'cancelled'); handle.dispose();
});

test('first use waits for exact prepared plugin receipt before claiming or sending the task', async () => {
  const gate=deferred(),f=fixture();let preparedRow;
  f.options.prepareExecution=async row=>{preparedRow=row;await gate.promise;return{ready:true,attempt:{...f.attempt,...row,status:'created'}};};
  const run=executeInWorkspace(f.ctx,f.options);await tick();
  assert.equal(f.calls.mounted,1);assert.equal(f.calls.claims.length,0,'installation must finish before submit grant');assert.equal(f.calls.prompt.length,0);
  assert.equal(preparedRow.sessionId,'exec');assert.equal(preparedRow.workspaceId,'ws');
  gate.resolve();const h=await run;assert.equal(f.calls.prompt.length,1);h.dispose();
});

test('failed plugin preparation stays unsent and resumable in the same session',async()=>{
  const f=fixture();f.options.prepareExecution=async()=>{throw Error('插件未能启用，请重试。');};
  const h=await executeInWorkspace(f.ctx,f.options);
  assert.equal(f.calls.claims.length,0);assert.equal(f.calls.prompt.length,0);assert.equal(h.getSnapshot().phase,'blocked');assert.equal(h.getSnapshot().canContinue,true);assert.match(h.getSnapshot().details,/未能启用/);assert.equal(h.sessionId,'exec');h.dispose();
});

test('forged preparation receipt cannot authorize a model request',async()=>{
  for(const change of [{sessionId:'other'},{workspaceId:'other'},{requestId:'other'},{status:'submitted'},{provenance:'imported'}]){
    const f=fixture();f.options.prepareExecution=async row=>({ready:true,attempt:{...f.attempt,...row,status:'created',...change}});
    const h=await executeInWorkspace(f.ctx,f.options);assert.equal(f.calls.prompt.length,0);assert.equal(f.calls.claims.length,0);h.dispose();
  }
});

test('stopping while plugins are preparing never sends a late model request',async()=>{
  const gate=deferred(),f=fixture();f.options.prepareExecution=async row=>{await gate.promise;return{ready:true,attempt:{...f.attempt,...row,status:'created'}};};
  let early;f.options.onHandle=h=>{early=h;};const run=executeInWorkspace(f.ctx,f.options);await tick();
  assert.equal(f.calls.prompt.length,0);await early.cancel();gate.resolve();const h=await run;
  assert.equal(f.calls.claims.length,0);assert.equal(f.calls.prompt.length,0);assert.equal(h.getSnapshot().phase,'cancelled');h.dispose();
});

test('observing a submitted request never prepares or reinstalls its plugins',async()=>{
  const f=fixture();f.options.attempt={...f.attempt,status:'submitted',sessionId:'exec'};let calls=0;f.options.prepareExecution=async()=>{calls++;throw Error('must not prepare');};
  const h=await executeInWorkspace(f.ctx,f.options);assert.equal(calls,0);assert.equal(f.calls.prompt.length,0);h.dispose();
});

test('stopping preparation aborts its install request and keeps cancellation durable',async()=>{
 const f=fixture();let signal,early;
 f.options.prepareExecution=async(_row,s)=>{signal=s;await new Promise((_,reject)=>s.addEventListener('abort',()=>reject(Error('request aborted')),{once:true}));};
 f.options.onHandle=h=>{early=h;};const run=executeInWorkspace(f.ctx,f.options);await tick();
 await early.cancel();const h=await run;assert.equal(signal.aborted,true);assert.equal(f.calls.claims.length,0);assert.equal(f.calls.prompt.length,0);assert.equal(h.getSnapshot().phase,'cancelled');h.dispose();
});

test('closing the view while installation completes never sends a late task',async()=>{
 const f=fixture(),gate=deferred();let early;
 f.options.prepareExecution=async row=>{await gate.promise;return{ready:true,attempt:{...f.attempt,...row,status:'created'}};};f.options.onHandle=h=>{early=h;};
 const run=executeInWorkspace(f.ctx,f.options);await tick();early.dispose();gate.resolve();await run;assert.equal(f.calls.prompt.length,0);assert.equal(f.calls.claims.length,0);
});
