import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { SystemPrompt, renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import { createCreatorAssist, registerCreatorAssist, hostPresetReader, renderCreatorPrompt, CREATOR_SECTION, CREATOR_MARKER, CREATOR_TOOLS, CREATOR_GUIDE } from '../src/creator-assist.js';
import { creatorProgress, creatorHandoffPrompt, openCreatorContinuation } from '../src/creator-strip.js';

function memoryStore({ enabled } = {}) {
  const state = { enabled, notes: new Map(), steps: new Map(), writes: [] };
  return {
    state,
    readEnabled: () => state.enabled,
    writeEnabled: value => { state.enabled = value; state.writes.push(['enabled', value]); },
    listNotes: () => [...state.notes.values()],
    putNote: row => { state.notes.set(row.id, row); },
    deleteNote: id => { state.notes.delete(id); },
    listSteps: () => [...state.steps.values()],
    putSteps: row => { state.steps.set(row.id, row); },
  };
}
const presetOf = agent => agent?.preset ?? null;
let seq = 0;
const make = (store = memoryStore()) => ({ store, assist: createCreatorAssist({ store, presetOf, now: () => new Date('2026-11-09T00:00:00Z'), newId: () => `note-${++seq}` }) });
const creatorAgent = { id: 'session-creator', preset: 'cordis' }, standardAgent = { id: 'session-standard', preset: 'standard' };

test('the experience prompt is short, carries one marker, and names the real tools', () => {
  const prompt = renderCreatorPrompt(0);
  assert.equal(prompt.split(CREATOR_MARKER).length - 1, 1);
  for (const name of ['finder_search', CREATOR_TOOLS.guide, CREATOR_TOOLS.step, CREATOR_TOOLS.note]) assert.match(prompt, new RegExp(name));
  assert.match(prompt, /Cmd\+R/);
  assert.match(prompt, /用户的明确要求优先/);
  assert.ok(prompt.length < 900, `prompt should stay short, got ${prompt.length}`);
  assert.doesNotMatch(prompt, /条经验/);
  assert.match(renderCreatorPrompt(3), /以前记下的 3 条经验/);
});

test('only creator-mode sessions receive the section; standard, unknown and disabled sessions get empty text', async () => {
  const { assist } = make();
  assert.equal(assist.sectionText({ agent: creatorAgent }).startsWith(CREATOR_MARKER), true);
  assert.equal(assist.sectionText({ scope: creatorAgent }).startsWith(CREATOR_MARKER), true);
  assert.equal(assist.sectionText({ agent: standardAgent }), '');
  assert.equal(assist.sectionText({ agent: { id: 'x' } }), '');
  assert.equal(assist.sectionText({}), '');
  await assist.setEnabled(false);
  assert.equal(assist.sectionText({ agent: creatorAgent }), '');
  assert.equal(assist.isCreator(creatorAgent), false);
  await assist.setEnabled(true);
  assert.equal(assist.isCreator(creatorAgent), true);
  const broken = createCreatorAssist({ store: memoryStore(), presetOf: () => { throw new Error('registry gone'); } });
  assert.equal(broken.sectionText({ agent: creatorAgent }), '');
});

test('the disabled setting persists and is honoured after a restart', async () => {
  const { store, assist } = make();
  await assist.setEnabled(false);
  assert.deepEqual(store.state.writes, [['enabled', false]]);
  const restarted = make(store).assist;
  assert.equal(restarted.isEnabled(), false);
  assert.equal(restarted.sectionText({ agent: creatorAgent }), '');
  await assert.rejects(restarted.setEnabled('yes'));
});

test('notes persist across restarts, dedupe, appear in the guide and update the prompt count', async () => {
  const { store, assist } = make();
  assert.equal(assist.guideText(), CREATOR_GUIDE);
  const first = await assist.addNote('  main 面板不要用 absolute 定位  ');
  assert.equal(first.count, 1);
  assert.equal(first.note.text, 'main 面板不要用 absolute 定位');
  assert.equal((await assist.addNote('main 面板不要用 absolute 定位')).duplicate, true);
  await assist.addNote('改了后台要彻底重启');
  await assert.rejects(assist.addNote('   '));
  assert.match(assist.guideText(), /你以前记下的经验\n- main 面板不要用 absolute 定位\n- 改了后台要彻底重启/);
  assert.match(assist.sectionText({ agent: creatorAgent }), /以前记下的 2 条经验/);
  const restarted = make(store).assist;
  assert.equal(restarted.settings().notes.length, 2);
  assert.match(restarted.sectionText({ agent: creatorAgent }), /以前记下的 2 条经验/);
  const removed = await restarted.deleteNote(first.note.id);
  assert.deepEqual(removed, { deleted: true, count: 1 });
  assert.equal((await restarted.deleteNote(first.note.id)).deleted, false);
  await assert.rejects(restarted.deleteNote('bad id'));
  assert.match(restarted.sectionText({ agent: creatorAgent }), /以前记下的 1 条经验/);
});

test('steps are validated, kept per session, capped at 20 and survive a restart', async () => {
  const { store, assist } = make();
  await assert.rejects(assist.recordStep('session-creator', { stage: 'deploy', summary: 'x' }));
  await assert.rejects(assist.recordStep('session-creator', { stage: 'design', summary: '' }));
  await assert.rejects(assist.recordStep('session-creator', { stage: 'design', summary: 'x', extra: 1 }));
  const result = await assist.recordStep('session-creator', { stage: 'search', summary: '找到 dsh-taskboard，用户决定自己做' });
  assert.deepEqual(result, { count: 1, label: '查现成' });
  for (let index = 0; index < 25; index += 1) await assist.recordStep('session-creator', { stage: 'feature', summary: `功能 ${index}` });
  const view = make(store).assist.session({ sessionId: 'session-creator' });
  assert.equal(view.steps.length, 20);
  assert.equal(view.steps.at(-1).summary, '功能 24');
  assert.equal(view.steps.at(-1).label, '加功能');
  assert.deepEqual(make(store).assist.session({ sessionId: 'session-other' }).steps, []);
  assert.throws(() => assist.session({ sessionId: '' }));
});

test('registration scopes three tools with when() and guards execution', async () => {
  const { assist } = make();
  const tools = new Map(), sections = [];
  const ctx = { tools: { resolve: async () => ({ dispose() {} }), register: (definition, options) => { tools.set(definition.name, { definition, options }); return () => tools.delete(definition.name); } }, systemPrompt: { section: section => { sections.push(section); return () => {}; } } };
  const release = registerCreatorAssist(ctx, assist, { defineTool });
  assert.equal(sections[0].name, CREATOR_SECTION);
  assert.equal(sections[0].interpolate, false);
  assert.deepEqual([...tools.keys()].sort(), Object.values(CREATOR_TOOLS).sort());
  for (const { options } of tools.values()) {
    assert.equal(await options.when({ agent: creatorAgent }), true);
    assert.equal(await options.when({ agent: standardAgent }), false);
  }
  const step = tools.get(CREATOR_TOOLS.step).definition;
  await assert.rejects(step.execute({ stage: 'design', summary: '三句话设计已确认' }, { agent: standardAgent }), /只在开启了/);
  assert.equal(await step.execute({ stage: 'design', summary: '三句话设计已确认' }, { agent: creatorAgent }), '已记录「定设计」。');
  const note = tools.get(CREATOR_TOOLS.note).definition;
  assert.match(await note.execute({ text: 'inject 要写 connection' }, { agent: creatorAgent }), /已记入插件经验，现有 1 条/);
  assert.match(await tools.get(CREATOR_TOOLS.guide).definition.execute({}, { agent: creatorAgent }), /inject 要写 connection/);
  release();
  assert.equal(tools.size, 0);
});

test('hosts without per-step tool conditions keep the prompt but register no creator tools', async () => {
  const { assist } = make();
  const registered = [], sections = [];
  const ctx = { tools: { register: definition => { registered.push(definition); return () => {}; } }, systemPrompt: { section: section => { sections.push(section); return () => {}; } } };
  registerCreatorAssist(ctx, assist, { defineTool });
  assert.equal(registered.length, 0);
  const text = sections[0].text({ agent: creatorAgent });
  assert.equal(text.split(CREATOR_MARKER).length - 1, 1);
  for (const name of Object.values(CREATOR_TOOLS)) assert.doesNotMatch(text, new RegExp(name));
  assert.match(text, /finder_search/);
  assert.equal(sections[0].text({ agent: standardAgent }), '');
});

test('host preset reader uses agentPresets.presetForSession and never guesses', () => {
  const session = { id: 's' };
  const read = hostPresetReader({ get: name => name === 'agentPresets' ? { presetForSession: value => value === session ? 'cordis' : null } : undefined });
  assert.equal(read({ id: 's', session }), 'cordis');
  assert.equal(read({ id: 's' }), null);
  assert.equal(hostPresetReader({ get: () => undefined })({ id: 's', session }), null);
});

test('real SystemPrompt and ToolRuntime: creator session gets one section and the tools, standard session gets neither', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber?.dispose?.());
  const systemPrompt = new SystemPrompt(ctx, {});
  const tools = new ToolRuntime(ctx);
  if (typeof tools.setExecutor !== 'function' || typeof tools.resolve !== 'function') {
    // DSH 0.2.1: no per-step conditions, so the real registry must hold none of the creator tools.
    registerCreatorAssist({ tools, systemPrompt: { section: () => () => {} }, effect: () => {} }, make().assist, { defineTool });
    for (const name of Object.values(CREATOR_TOOLS)) assert.equal(tools.get(name), undefined);
    return;
  }
  tools.setExecutor({ describe: definitions => ({ schemas: definitions.map(item => ({ name: item.name, description: item.description, parameters: { type: 'object', properties: {} } })) }), execute: async () => [] });
  const { assist } = make();
  registerCreatorAssist({ tools, systemPrompt, effect: () => {} }, assist, { defineTool });
  const look = async agent => {
    const assembly = await systemPrompt.assemble({ agent, scope: agent });
    const rendered = renderPrompt(assembly);
    const text = typeof rendered === 'string' ? rendered : JSON.stringify(rendered);
    const set = await tools.resolve({ agent, signal: new AbortController().signal });
    try {
      const visible = tools.schemas(agent, set).map(item => item.name);
      return { sections: assembly.sections.filter(item => item.name === CREATOR_SECTION && item.text).length, markers: text.split(CREATOR_MARKER).length - 1, tools: Object.values(CREATOR_TOOLS).filter(name => visible.includes(name)).length };
    } finally { set.dispose(); }
  };
  assert.deepEqual(await look(creatorAgent), { sections: 1, markers: 1, tools: 3 });
  assert.deepEqual(await look(standardAgent), { sections: 0, markers: 0, tools: 0 });
  await assist.setEnabled(false);
  assert.deepEqual(await look(creatorAgent), { sections: 0, markers: 0, tools: 0 });
});

test('progress folds steps into five stages and flags a block', () => {
  assert.deepEqual(creatorProgress([]).stages.map(stage => stage.state), ['todo', 'todo', 'todo', 'todo', 'todo']);
  const progress = creatorProgress([{ stage: 'search', summary: 'a' }, { stage: 'design', summary: 'b' }, { stage: 'skeleton', summary: '空架子能点开' }]);
  assert.deepEqual(progress.stages.map(stage => stage.state), ['done', 'done', 'current', 'todo', 'todo']);
  assert.deepEqual(progress.last, { stage: 'skeleton', label: '空架子', summary: '空架子能点开' });
  const blocked = creatorProgress([{ stage: 'feature', summary: 'x' }, { stage: 'blocked', summary: '白屏，改了 3 轮' }]);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.stages[3].state, 'current');
  assert.equal(creatorProgress([{ stage: 'nonsense', summary: 'x' }]).count, 0);
});

test('handoff prompt only restates recorded progress and asks to read the guide', () => {
  const prompt = creatorHandoffPrompt([{ stage: 'design', summary: '挂在 conversation.view' }, { stage: 'blocked', summary: '白屏' }]);
  assert.match(prompt, /1\. 定设计：挂在 conversation\.view\n2\. 卡住了：白屏/);
  assert.match(prompt, /finder_creator_guide/);
  assert.match(creatorHandoffPrompt([]), /还没有记录进展/);
});

test('continuation opens a creator session in the same workspace with an unsent draft', async () => {
  const log = { created: [], drafts: [], opened: [], released: 0 };
  const binding = { sessionId: 'session-next', ctx: { get: name => name === 'conversation' ? { input: { requestDraftInitialization: (b, options) => { log.drafts.push(options); return 'applied'; } } } : undefined } };
  const ctx = {
    workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'ws-a', sessionIds: ['session-old'] }, { workspaceId: 'ws-b', sessionIds: [] }] }) } },
    sessions: { create: async options => { log.created.push(options); return 'session-next'; }, retain: () => ({ ready: Promise.resolve(), binding, release: () => { log.released += 1; } }) },
    uiWorkspace: { openSession: id => log.opened.push(id) },
  };
  const result = await openCreatorContinuation(ctx, 'session-old', '接着做');
  assert.deepEqual(result, { sessionId: 'session-next', draft: 'applied' });
  assert.deepEqual(log.created, [{ workspaceId: 'ws-a', agentPreset: 'cordis' }]);
  assert.deepEqual(log.drafts, [{ prompt: '接着做', clearPreviousDraft: false }]);
  assert.deepEqual(log.opened, ['session-next']);
  assert.equal(log.released, 1);
  await assert.rejects(openCreatorContinuation(ctx, 'session-unknown', 'x'), /没找到这个会话所在的工作区/);
});
