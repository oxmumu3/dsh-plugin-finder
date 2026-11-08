import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinderController } from '../src/client.js';

const intent = { goal: '整理阅读笔记', input: 'Markdown', output: '待办', constraints: ['不修改原文'], capabilities: ['整理笔记'], queries: ['notes'] };
const plan = { kind: 'native', title: '先整理选定的笔记', rationale: '从已给材料开始', pluginIds: [], steps: [{ capability: '整理笔记', owner: 'dsh', sourceCapability: null, action: '提取待办', input: 'Markdown', output: '待办' }], limits: ['材料路径待确认'], nextPrompt: '请先核对材料。' };
const workflow = { taskId: 'task-a', revisionId: 'r1', revisionNumber: 1, stage: 'plan', request: '整理阅读笔记', intent, plan, candidates: [], revisions: [], feedback: [], conversation: [] };
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// Fake host session services shaped like the official controller:
// retain() returns a reference whose binding exposes session + eventSource.
function hostSessions({ accept = true } = {}) {
  const log = { created: [], retained: [], released: [], prompts: [], renames: [] };
  const bindings = new Map();
  const bindingFor = sessionId => {
    if (bindings.has(sessionId)) return bindings.get(sessionId);
    const listeners = new Set();
    const eventSource = { entries: [], getSnapshot() { return { entries: this.entries }; }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, push(event) { this.entries = [...this.entries, { type: 'event', event }]; for (const fn of [...listeners]) fn(); } };
    const session = {
      projections: { faceOf: name => name === 'agentPreset' ? { getSnapshot: () => 'standard' } : undefined },
      async prompt(content, mode, signal, requestId) { log.prompts.push({ sessionId, content, mode, requestId }); return accept ? { ok: true, value: { accepted: true } } : { ok: false, error: { message: 'rejected' } }; },
      async rename(title) { log.renames.push({ sessionId, title }); return { ok: true, value: { title } }; },
    };
    const binding = { sessionId, session, eventSource };
    bindings.set(sessionId, binding);
    return binding;
  };
  const sessions = {
    create: async opts => { log.created.push(opts); return `session-new-${log.created.length}`; },
    retain: (sessionId, opts) => { log.retained.push({ sessionId, opts }); return { ready: Promise.resolve(), binding: bindingFor(sessionId), release: () => log.released.push(sessionId) }; },
    binding: sessionId => bindings.get(sessionId),
    list: { getSnapshot: () => ({ phase: 'ready', byId: {} }), subscribe: () => () => {} },
  };
  return { sessions, log, bindingFor };
}

function setup({ stored = null, accept = true } = {}) {
  const host = hostSessions({ accept });
  const calls = [];
  let expert = stored;
  const ctx = { sessions: host.sessions, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'ws-1', title: 'Agent', sessionIds: [] }] }), subscribe: () => () => {} } } };
  const storage = new Map();
  const controller = createFinderController(ctx, {
    draftStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (url, options) => {
      const path = url.split('/').at(-1), body = options.body && JSON.parse(options.body); calls.push({ path, body });
      let value = {};
      if (path === 'bootstrap') value = { model: { configured: true, label: 'fixture' }, workflow };
      if (path === 'expert-state') value = { expert };
      if (path === 'expert-attach') { expert = { taskId: body.taskId, revisionId: body.revisionId, sessionId: body.sessionId, workspaceId: body.workspaceId, plan: null, planVersion: 0 }; value = { expert, attached: true, conflict: false, verification: { sectionCount: 1 } }; }
      if (path === 'expert-verify') value = { expert, verification: { sectionCount: 1, toolVisible: true } };
      return { ok: true, json: async () => value };
    },
  });
  return { controller, calls, host, setPlan: next => { expert = { ...expert, ...next }; } };
}

test('first follow-up creates one standard session in the task workspace, names it, sends the note and keeps the binding', async () => {
  const { controller: c, calls, host } = setup();
  await c.bootstrap(); c.showFind();
  c.setFollowup('我已经装了 dsh-taskboard，能直接用吗？');
  assert.equal(c.getSnapshot().expertAvailable, true);
  assert.equal(await c.startExpert(), true);
  assert.deepEqual(host.log.created, [{ workspaceId: 'ws-1', agentPreset: 'standard' }]);
  const attach = calls.find(call => call.path === 'expert-attach');
  assert.deepEqual(attach.body, { taskId: 'task-a', revisionId: 'r1', sessionId: 'session-new-1', workspaceId: 'ws-1' });
  assert.deepEqual(host.log.renames, [{ sessionId: 'session-new-1', title: '插件专家 · 先整理选定的笔记' }]);
  assert.equal(host.log.prompts.length, 1);
  assert.deepEqual(host.log.prompts[0].content, [{ type: 'text', text: '我已经装了 dsh-taskboard，能直接用吗？' }]);
  assert.equal(host.log.prompts[0].mode, 'queue');
  const s = c.getSnapshot();
  assert.equal(s.expertPhase, 'ready');
  assert.equal(s.expertReference.binding.sessionId, 'session-new-1');
  assert.equal(s.followupText, '');
  c.close();
  assert.deepEqual(host.log.released, ['session-new-1']);
});

test('a second message reuses the bound session instead of creating or renaming again', async () => {
  const { controller: c, host } = setup();
  await c.bootstrap(); c.showFind();
  c.setFollowup('第一句'); assert.equal(await c.startExpert(), true);
  c.setFollowup('第二句'); assert.equal(await c.startExpert(), true);
  assert.equal(host.log.created.length, 1);
  assert.equal(host.log.renames.length, 1);
  assert.deepEqual(host.log.prompts.map(p => p.sessionId), ['session-new-1', 'session-new-1']);
  c.close();
});

test('reopening a task returns to its saved expert session without creating a new one', async () => {
  const stored = { taskId: 'task-a', revisionId: 'r1', sessionId: 'session-saved', workspaceId: 'ws-1', plan: null, planVersion: 0 };
  const { controller: c, host, calls } = setup({ stored });
  await c.bootstrap(); c.showFind();
  c.ensureExpert();
  await tick(10);
  assert.equal(host.log.created.length, 0);
  assert.deepEqual(host.log.retained.map(r => r.sessionId), ['session-saved']);
  assert.equal(c.getSnapshot().expertReference.binding.sessionId, 'session-saved');
  assert.equal(c.getSnapshot().expertPhase, 'ready');
  assert.ok(calls.some(call => call.path === 'expert-state' && call.body.taskId === 'task-a'));
  c.ensureExpert(); await tick(10);
  assert.equal(host.log.retained.length, 1, 'same task must not re-bind');
  c.close();
});

test('a finder_plan_update call in the expert session refreshes the plan card', async () => {
  const stored = { taskId: 'task-a', revisionId: 'r1', sessionId: 'session-saved', workspaceId: 'ws-1', plan: null, planVersion: 0 };
  const { controller: c, host, setPlan } = setup({ stored });
  await c.bootstrap(); c.showFind();
  c.ensureExpert(); await tick(10);
  assert.equal(c.getSnapshot().expert.plan, null);
  setPlan({ plan: { title: '直接用 dsh-taskboard', summary: '已装，先试', plugins: [], steps: [], limits: [] }, planVersion: 1 });
  host.bindingFor('session-saved').eventSource.push({ type: 'tool/call', data: { name: 'finder_plan_update' } });
  await tick(1400);
  assert.equal(c.getSnapshot().expert.planVersion, 1);
  assert.equal(c.getSnapshot().expert.plan.title, '直接用 dsh-taskboard');
  c.close();
});

test('an unaccepted prompt keeps the note and reports the failure', async () => {
  const { controller: c, host } = setup({ accept: false });
  await c.bootstrap(); c.showFind();
  c.setFollowup('保留这句');
  assert.equal(await c.startExpert(), false);
  assert.equal(host.log.prompts.length, 1);
  assert.equal(c.getSnapshot().followupText, '保留这句');
  assert.match(c.getSnapshot().expertError, /尚未确认送达/);
  c.close();
});
