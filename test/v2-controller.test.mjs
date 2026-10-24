import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinderController } from '../src/client.js';

const intent = { goal: '整理阅读笔记', input: 'Markdown', output: '带出处的阅读笔记', constraints: ['不修改原文'], capabilities: ['整理笔记'], queries: ['reading notes'] };
const plan = { kind: 'native', title: '先整理选定的文章', rationale: '从已给材料开始', pluginIds: [], steps: [{ capability: '整理笔记', owner: 'dsh', sourceCapability: null, action: '提取观点并附出处', input: 'Markdown', output: '笔记' }], limits: ['材料路径待确认'], nextPrompt: '请先核对材料。' };
const workflow = (revisionId = 'r1', patch = {}) => ({ taskId: 'task-a', revisionId, revisionNumber: Number(revisionId.slice(1)), stage: 'plan', request: '整理阅读笔记，不修改原文', intent, plan, candidates: [], revisions: [], feedback: [], conversation: [{ id: 'request', role: 'user', text: '整理阅读笔记，不修改原文', revisionId: 'r1', revisionNumber: 1 }], ...patch });
function setup(routes = {}, storage = new Map()) {
  const calls = [];
  const ctx = { workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [] }), subscribe: () => () => {} } } };
  const controller = createFinderController(ctx, {
    draftStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (url, options) => {
      const path = url.split('/').at(-1), body = options.body && JSON.parse(options.body); calls.push({ path, body });
      if (routes[path]) return routes[path](body, options);
      const value = path === 'bootstrap' ? { model: { configured: true, label: 'fixture' }, workflow: workflow() } : path === 'refine' ? { workflow: workflow('r2', { stage: 'understand', plan: undefined }) } : path === 'recommend' ? { workflow: workflow('r3', { plan: { ...plan, title: '修改后的方案' } }) } : path === 'open' ? { workflow: workflow(body.revisionId) } : {};
      return { ok: true, json: async () => value };
    },
  });
  return { controller, calls, storage };
}

test('conversational adjustment uses existing real refine and recommend endpoints on one task', async () => {
  const { controller: c, calls, storage } = setup(); await c.bootstrap(); c.showFind();
  c.setFollowup('只整理这三篇文章');
  assert.equal(await c.submitFollowup(), true);
  assert.deepEqual(calls.map(x => x.path), ['bootstrap', 'refine', 'recommend']);
  assert.deepEqual(calls[1].body, { taskId: 'task-a', revisionId: 'r1', feedback: '只整理这三篇文章' });
  assert.equal(calls[2].body.revisionId, 'r2');
  assert.equal(c.getSnapshot().plan.title, '修改后的方案');
  assert.equal(c.getSnapshot().followupText, '');
  assert.equal(c.getSnapshot().followupPending, false);
  assert.equal(storage.get('dsh.plugin-finder.followup.task-a.r1'), ''); c.close();
});

test('failed recommendation keeps previous outcome and retries without repeating a saved refinement', async () => {
  let count = 0;
  const { controller: c, calls } = setup({ recommend: async () => ++count === 1 ? { ok: false, json: async () => ({ error: { message: '来源暂时不可用' } }) } : { ok: true, json: async () => ({ workflow: workflow('r3') }) } });
  await c.bootstrap(); c.setFollowup('只整理这三篇文章');
  assert.equal(await c.submitFollowup(), false);
  assert.equal(c.getSnapshot().followupText, '只整理这三篇文章');
  assert.equal(c.getSnapshot().pendingOutcome.plan.title, plan.title);
  assert.equal(c.getSnapshot().revisionId, 'r2');
  assert.equal(await c.submitFollowup(), true);
  assert.equal(calls.filter(x => x.path === 'refine').length, 1);
  assert.equal(calls.filter(x => x.path === 'recommend').length, 2); c.close();
});

test('cancelled refinement preserves unsent input and ignores a late result', async () => {
  let resolve;
  const { controller: c } = setup({ refine: () => new Promise(done => { resolve = done; }) });
  await c.bootstrap(); c.setFollowup('只整理这三篇文章');
  const pending = c.submitFollowup(); c.cancel();
  resolve({ ok: true, json: async () => ({ workflow: workflow('r2', { stage: 'understand', plan: undefined }) }) });
  assert.equal(await pending, false);
  assert.equal(c.getSnapshot().revisionId, 'r1');
  assert.equal(c.getSnapshot().followupText, '只整理这三篇文章');
  assert.equal(c.getSnapshot().followupPending, false); c.close();
});

test('a failed recommendation resumes after reopening without repeating a saved refinement', async () => {
  const a = setup({ recommend: async () => ({ ok: false, json: async () => ({ error: { message: '临时失败' } }) }) });
  await a.controller.bootstrap(); a.controller.setFollowup('只做手动整理');
  await a.controller.submitFollowup(); a.controller.close();
  const b = setup({ bootstrap: async () => ({ ok: true, json: async () => ({ model: { configured: true }, workflow: workflow('r2', { stage: 'understand', plan: undefined }) }) }) }, a.storage);
  await b.controller.bootstrap();
  assert.equal(b.controller.getSnapshot().pendingOutcome.plan.title, plan.title);
  assert.equal(b.controller.getSnapshot().followupRetry.revisionId, 'r2');
  assert.equal(await b.controller.submitFollowup(), true);
  assert.deepEqual(b.calls.map(x => x.path), ['bootstrap', 'recommend']);
  assert.equal(a.storage.get('dsh.plugin-finder.followup.task-a.r1'), '');
  assert.equal(a.storage.has('dsh.plugin-finder.followup.task-a.r2.recovery'), false); b.controller.close();
});

test('retrying a child does not erase a later edit in its parent draft', async () => {
  let failed = true;
  const { controller: c } = setup({ recommend: async () => failed ? { ok: false, json: async () => ({ error: { message: '临时失败' } }) } : { ok: true, json: async () => ({ workflow: workflow('r3') }) }, open: async body => ({ ok: true, json: async () => ({ workflow: workflow(body.revisionId, body.revisionId === 'r2' ? { stage: 'understand', plan: undefined } : {}) }) }) });
  await c.bootstrap(); c.setFollowup('调整 A'); await c.submitFollowup();
  await c.openTask('task-a', 'r1'); c.setFollowup('后来编辑的 B');
  await c.openTask('task-a', 'r2'); failed = false; assert.equal(await c.submitFollowup(), true);
  await c.openTask('task-a', 'r1'); assert.equal(c.getSnapshot().followupText, '后来编辑的 B'); c.close();
});

test('selecting an editable home example preserves the previous unsent input', async () => {
  const { controller: c } = setup(); await c.bootstrap(); c.setHomeRequest('没有发送的新需求');
  assert.equal(c.prepareHomeExample('整理带出处的笔记'), true);
  assert.equal(c.getSnapshot().homeRequest, '整理带出处的笔记');
  assert.equal(c.getSnapshot().featuredDrafts[0].request, '没有发送的新需求'); c.close();
});

test('followup inputs restore by exact task version and remain separate from home draft', async () => {
  const a = setup(); await a.controller.bootstrap(); a.controller.setFollowup('这一版不要自动分类'); a.controller.setHomeRequest('另一个新需求'); a.controller.close();
  const b = setup({}, a.storage); await b.controller.bootstrap();
  assert.equal(b.controller.getSnapshot().followupText, '这一版不要自动分类');
  assert.equal(b.controller.getSnapshot().homeRequest, '另一个新需求');
  await b.controller.openTask('task-a', 'r2'); assert.equal(b.controller.getSnapshot().followupText, '');
  await b.controller.openTask('task-a', 'r1'); assert.equal(b.controller.getSnapshot().followupText, '这一版不要自动分类'); b.controller.close();
});

test('creation conversation includes unsaved edits and does not use the ordinary refinement route', async () => {
  const blueprint = Object.fromEntries(['name', 'purpose', 'workflow', 'inputs', 'outputs', 'ui', 'data', 'tools', 'runtime', 'scope', 'acceptance'].map(key => [key, key === 'name' ? '阅读助手' : '原始内容']));
  const creation = { blueprint, answers: [], assumptions: ['只用本地文章'], status: 'draft', supply: { status: 'stale' }, contentHash: 'hash', draft: 'blueprint text' };
  const { controller: c, calls } = setup({ bootstrap: async () => ({ ok: true, json: async () => ({ model: { configured: true }, workflow: workflow('r1', { creation }) }) }), 'creation-refine': async body => ({ ok: true, json: async () => ({ workflow: workflow('r2', { creation: { ...creation, blueprint: body.blueprint, contentHash: 'new-hash' } }) }) }) });
  await c.bootstrap(); c.showCreation(); c.editCreation({ blueprint: { scope: '只做手动添加，不做文件监听' } }); c.setFollowup('再加一个未读筛选');
  assert.equal(await c.submitFollowup(), true);
  const request = calls.find(x => x.path === 'creation-refine');
  assert.equal(request.body.blueprint.scope, '只做手动添加，不做文件监听');
  assert.equal(request.body.feedback, '再加一个未读筛选');
  assert.equal(calls.some(x => x.path === 'refine' || x.path === 'recommend'), false);
  assert.equal(c.getSnapshot().creationDirty, false); assert.equal(c.getSnapshot().followupText, ''); c.close();
});

for (const mode of ['regenerate', 'confirm']) test(`${mode} preserves pre-model edits when reopening the exact source version`, async () => {
  const blueprint = Object.fromEntries(['name', 'purpose', 'workflow', 'inputs', 'outputs', 'ui', 'data', 'tools', 'runtime', 'scope', 'acceptance'].map(key => [key, '原始已保存内容']));
  const creation = { blueprint, answers: [], assumptions: [], status: 'draft', supply: { status: 'stale' }, contentHash: 'source-hash', draft: 'original draft' };
  const routes = {
    bootstrap: async () => ({ ok: true, json: async () => ({ model: { configured: true }, workflow: workflow('r1', { creation }) }) }),
    // A valid generated blueprint may omit an unrelated manual edit. It must
    // not become the only surviving copy of the user's pre-model input.
    'creation-update': async () => ({ ok: true, json: async () => ({ workflow: workflow('r2', { creation: { ...creation, contentHash: 'generated-hash' } }) }) }),
    open: async body => ({ ok: true, json: async () => ({ workflow: workflow(body.revisionId, { creation }) }) }),
  };
  const a = setup(routes); await a.controller.bootstrap(); a.controller.showCreation();
  a.controller.editCreation({ blueprint: { scope: '必须保留的未保存人工范围' } });
  assert.equal(await a.controller.updateCreation(mode === 'confirm', mode === 'regenerate'), true);
  assert.equal(a.controller.getSnapshot().creationForm.blueprint.scope, '原始已保存内容');
  assert.equal(a.controller.getSnapshot().creationDirty, false);
  await a.controller.openTask('task-a', 'r1');
  assert.equal(a.controller.getSnapshot().creationForm.blueprint.scope, '必须保留的未保存人工范围');
  assert.equal(a.controller.getSnapshot().creationDirty, true); a.controller.close();
  const b = setup(routes, a.storage); await b.controller.bootstrap();
  assert.equal(b.controller.getSnapshot().revisionId, 'r1');
  assert.equal(b.controller.getSnapshot().creationForm.blueprint.scope, '必须保留的未保存人工范围');
  b.controller.close();
});

test('a plain creation save clears the source editor after persisting its exact fields', async () => {
  const blueprint = Object.fromEntries(['name', 'purpose', 'workflow', 'inputs', 'outputs', 'ui', 'data', 'tools', 'runtime', 'scope', 'acceptance'].map(key => [key, '原始已保存内容']));
  const creation = { blueprint, answers: [], assumptions: [], status: 'draft', supply: { status: 'stale' }, contentHash: 'source-hash', draft: 'original draft' };
  const { controller: c } = setup({
    bootstrap: async () => ({ ok: true, json: async () => ({ model: { configured: true }, workflow: workflow('r1', { creation }) }) }),
    'creation-update': async body => ({ ok: true, json: async () => ({ workflow: workflow('r2', { creation: { ...creation, blueprint: body.blueprint, contentHash: 'saved-hash' } }) }) }),
    open: async () => ({ ok: true, json: async () => ({ workflow: workflow('r1', { creation }) }) }),
  });
  await c.bootstrap(); c.showCreation(); c.editCreation({ blueprint: { scope: '直接保存的人工范围' } });
  assert.equal(await c.updateCreation(), true);
  assert.equal(c.getSnapshot().creationForm.blueprint.scope, '直接保存的人工范围');
  await c.openTask('task-a', 'r1');
  assert.equal(c.getSnapshot().creationForm.blueprint.scope, '原始已保存内容');
  assert.equal(c.getSnapshot().creationDirty, false); c.close();
});
