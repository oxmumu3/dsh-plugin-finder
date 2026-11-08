import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { createExpertSessions, registerExpertSession, EXPERT_SECTION, EXPERT_TOOL, EXPERT_MARKER } from '../src/expert-session.js';
// The official SDK is a peer dependency: present locally and in the SDK compatibility
// jobs (which forbid skipped tests), absent in the peer-less publish preparation job.
const sdk = await Promise.all([import('@deepseek-ai/dsh-tools'), import('@deepseek-ai/dsh-system-prompt')])
  .then(([tools, prompt]) => ({ ToolRuntime: tools.ToolRuntime, defineTool: tools.defineTool, SystemPrompt: prompt.SystemPrompt, renderPrompt: prompt.renderPrompt }))
  .catch(() => null);
const realSdk = { skip: sdk ? false : 'official DSH SDK peers are not installed here; the SDK compatibility jobs run this test' };


// Real SDK services, not mocks: the official prompt registry and tool runtime
// decide visibility. The executor is the only stub, because prompt assembly
// requires one and the native executor is not a test dependency.
test('real SystemPrompt and ToolRuntime scope the expert prompt and tool to the bound session only', realSdk, async t => {
  const { ToolRuntime, SystemPrompt, renderPrompt, defineTool } = sdk;
  const ctx = new Context();
  t.after(() => ctx.fiber?.dispose?.());
  const systemPrompt = new SystemPrompt(ctx, {});
  const tools = new ToolRuntime(ctx);
  if (typeof tools.setExecutor !== 'function' || typeof tools.resolve !== 'function') {
    // DSH 0.2.1: no per-step conditions, so the real registry must hold no expert tool at all.
    const experts = createExpertSessions({ store: { list: () => [], write: () => {} }, readTask: async () => ({}) });
    registerExpertSession({ tools, systemPrompt: { section: () => () => {} }, effect: () => {} }, experts, { defineTool });
    assert.equal(tools.get(EXPERT_TOOL), undefined);
    return;
  }
  tools.setExecutor({ describe: definitions => ({ schemas: definitions.map(item => ({ name: item.name, description: item.description, parameters: { type: 'object', properties: {} } })) }), execute: async () => [] });
  const task = { id: 'task-a', originalRequest: '把 Markdown 笔记整理成待办 {{cwd}}', revisions: [{ id: 'rev-1', workflow: { intent: { goal: '笔记转待办' }, plan: { kind: 'single', title: '待办插件', pluginIds: [] }, candidates: [] } }] };
  const experts = createExpertSessions({ store: { list: () => [], write: () => {} }, readTask: async () => task });
  await experts.attach({ taskId: 'task-a', revisionId: 'rev-1', sessionId: 'session-expert', workspaceId: 'ws-1' });
  registerExpertSession({ tools, systemPrompt, effect: () => {} }, experts, { defineTool });
  const expert = { id: 'session-expert' }, other = { id: 'session-plain' };
  const look = async agent => {
    const assembly = await systemPrompt.assemble({ agent, scope: agent });
    const rendered = renderPrompt(assembly);
    const text = typeof rendered === 'string' ? rendered : JSON.stringify(rendered);
    const set = await tools.resolve({ agent, signal: new AbortController().signal });
    try {
      return {
        sections: assembly.sections.filter(item => item.name === EXPERT_SECTION && item.text).length,
        markers: text.split(EXPERT_MARKER).length - 1,
        literalKept: text.includes('{{cwd}}'),
        tool: tools.schemas(agent, set).some(item => item.name === EXPERT_TOOL),
        executable: Boolean(tools.executable(EXPERT_TOOL, agent, set)),
      };
    } finally { set.dispose(); }
  };
  assert.deepEqual(await look(expert), { sections: 1, markers: 1, literalKept: true, tool: true, executable: true });
  assert.deepEqual(await look(other), { sections: 0, markers: 0, literalKept: false, tool: false, executable: false });
  assert.equal(tools.executable(EXPERT_TOOL, expert), undefined, 'a condition tool without a resolved step set must stay unavailable');
});
