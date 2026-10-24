import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionFileOpener, renderExecutionAssistant } from '../src/execution-markdown.js';
import * as executionMarkdown from '../src/execution-markdown.js';

function fixture() {
  const binding = { sessionId: 'exact/session' }, calls = [], errors = [];
  const reference = { sessionId: 'exact/session', binding };
  const sessions = { binding: () => binding, list: { getSnapshot: () => ({ byId: { 'exact/session': { cwd: '/work/project' } } }) } };
  const options = { reference, sessionId: reference.sessionId, sessions, sidebarRight: { openResource: (...args) => calls.push(args) }, onError: message => errors.push(message) };
  return { options, calls, errors };
}

test('relative artifact links open through the exact session resource address, never a Web URL', async () => {
  const f = fixture(); const open = createExecutionFileOpener(f.options);
  await open('finder-counter-acceptance/README.md', { line: 12 });
  assert.deepEqual(f.calls, [['dsh-resource://file/session/exact%2Fsession/finder-counter-acceptance/README.md', { params: { line: 12 } }]]);
  await open('/work/project/with space/说明.md');
  assert.equal(f.calls[1][0], 'dsh-resource://file/session/exact%2Fsession/with%20space/%E8%AF%B4%E6%98%8E.md');
});

test('released, changed, and different-session references cannot open files', async () => {
  for (const kind of ['released', 'changed', 'different']) {
    const f = fixture(); const open = createExecutionFileOpener(f.options);
    if (kind === 'released') Object.defineProperty(f.options.reference, 'binding', { get() { throw new Error('released'); } });
    if (kind === 'changed') f.options.sessions.binding = () => ({ sessionId: f.options.sessionId });
    if (kind === 'different') f.options.reference.sessionId = 'other-session';
    assert.equal(await open('README.md'), false); assert.equal(f.calls.length, 0); assert.equal(f.errors.length, 1);
  }
});

test('assistant source reaches official Markdown intact inside its local-file delegate', () => {
  const h = (type, props, ...children) => ({ type, props, children });
  const primitives = { MarkdownText() {}, MarkdownDelegateProvider() {} }, openFile = () => {};
  const text = '## 结果\n\n| 项目 | 状态 |\n| --- | --- |\n| 页面 | 已生成 |\n\n[README](finder-counter-acceptance/README.md)';
  const tree = renderExecutionAssistant(h, primitives, text, openFile);
  assert.equal(tree.type, primitives.MarkdownDelegateProvider); assert.equal(tree.props.openFile, openFile);
  assert.equal(tree.children[0].type, primitives.MarkdownText); assert.equal(tree.children[0].props.text, text);
  assert.equal(tree.children[0].props.streaming, false);
});

function previewFixture() {
  assert.equal(typeof executionMarkdown.createExecutionPreviewSurface, 'function');
  const f = fixture();
  const claims = [];
  const sidebarRightTabs = {
    claim: address => { claims.push(address); return { kind: 'text', contentId: address, title: 'README.md' }; },
    get: kind => kind === 'text' ? { id: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview', kind } : undefined,
  };
  const surface = executionMarkdown.createExecutionPreviewSurface({ ...f.options, sidebarRightTabs });
  return { ...f, surface, claims };
}

test('a global panel opens an exact session file in its own official preview seat without a mounted main sidebar', async () => {
  const f = previewFixture();
  const open = createExecutionFileOpener({ ...f.options, sidebarRight: f.surface });
  assert.equal(await open('README.md', { line: 7 }), true);
  assert.equal(f.calls.length, 0, 'the main-session sidebar navigation must not be used');
  const preview = f.surface.getSnapshot();
  assert.equal(preview.entryKey, '@deepseek-ai/dsh-client-ui-sidebar-documentpreview');
  assert.equal(preview.sessionId, 'exact/session');
  const useTabInfo = executionMarkdown.executionPreviewTabInfoFactory({ sessionId: 'exact/session' }, preview.hookContext);
  const info = useTabInfo();
  assert.equal(info.tab.contentId, 'dsh-resource://file/session/exact%2Fsession/README.md');
  assert.deepEqual(info.tab.navigation.params, { line: 7 });
  assert.equal(info.tab.visible, true);
  assert.equal(info.tab.signal.aborted, false);
  assert.throws(() => executionMarkdown.executionPreviewTabInfoFactory({ sessionId: 'another' }, preview.hookContext)(), /会话/);
  f.surface.dispose();
});

test('same-file line navigation keeps its occurrence while switching, closing and unloading abort old preview reads', () => {
  const f = previewFixture(), address = 'dsh-resource://file/session/exact%2Fsession/README.md';
  f.surface.openResource(address, { params: { line: 1 } });
  const first = f.surface.getSnapshot();
  f.surface.openResource(address, { params: { line: 12 } });
  const second = f.surface.getSnapshot();
  assert.equal(second.tabId, first.tabId);
  assert.equal(first.hookContext.signal.aborted, false);
  assert.equal(second.hookContext.useTabNavigation(second.tabId).revision, 2);
  assert.equal(second.hookContext.useTabNavigation(second.tabId).params.line, 12);
  f.surface.openResource('dsh-resource://file/session/exact%2Fsession/result.md');
  const third = f.surface.getSnapshot();
  assert.equal(first.hookContext.signal.aborted, true);
  assert.notEqual(third.tabId, first.tabId);
  third.hookContext.actions.close();
  assert.equal(third.hookContext.signal.aborted, true);
  assert.equal(f.surface.getSnapshot(), null);
  f.surface.openResource(address);
  const last = f.surface.getSnapshot();
  f.surface.dispose();
  assert.equal(last.hookContext.signal.aborted, true);
  assert.throws(() => f.surface.openResource(address), /会话/);
});

test('preview resource navigation refuses another session and an obsolete exact binding', () => {
  const f = previewFixture();
  assert.throws(() => f.surface.openResource('dsh-resource://file/session/other/README.md'), /会话/);
  assert.equal(f.surface.getSnapshot(), null);
  f.options.sessions.binding = () => ({ sessionId: 'exact/session' });
  assert.throws(() => f.surface.openResource('dsh-resource://file/session/exact%2Fsession/README.md'), /会话/);
  assert.equal(f.claims.length, 0);
  f.surface.dispose();
});

test('reopening the same session never reuses the official document store key from an old surface', () => {
  const first = previewFixture(), second = previewFixture();
  first.surface.openResource('dsh-resource://file/session/exact%2Fsession/first.md');
  second.surface.openResource('dsh-resource://file/session/exact%2Fsession/second.md');
  assert.notEqual(first.surface.getSnapshot().tabId, second.surface.getSnapshot().tabId);
  first.surface.dispose(); second.surface.dispose();
});

test('official preview registrations are mirrored only into private declared children and fully released', () => {
  assert.equal(typeof executionMarkdown.mirrorExecutionPreviewSlots, 'function');
  const specs = new Map([
    ['sidebar.right.pane.tab', { kind: 'keyed', scope: 'session' }],
    ['sidebar.right.tab.document', { kind: 'keyed', scope: 'session' }],
    ['finder.preview', { kind: 'keyed', scope: 'session' }],
  ]);
  const officialStore = { create() {} }, officialInject = () => ({ read() {} });
  const OfficialFile = () => {}, MarkdownStudio = () => {}, Chat = () => {};
  const entries = new Map([
    ['sidebar.right.pane.tab', [
      { component: OfficialFile, options: { key: 'official-file' }, children: { 'sidebar.right.tab.document': { kind: 'keyed', scope: 'session' } }, store: officialStore, inject: officialInject, locale: 'document' },
      { component: Chat, options: { key: 'unrelated-chat' } },
    ]],
    ['sidebar.right.tab.document', [{ component: MarkdownStudio, options: { key: 'mdstudio' } }]],
  ]);
  const subscriptions = new Map(), originalEntries = [...entries.get('sidebar.right.pane.tab')];
  const slots = {
    entriesOfSlot: key => entries.get(key) || [],
    subscribe(key, listener) { const listeners = subscriptions.get(key) || new Set(); listeners.add(listener); subscriptions.set(key, listeners); return () => listeners.delete(listener); },
    register(options, component) {
      assert.ok(specs.has(options.name), 'target slot must be declared');
      for (const [key, spec] of Object.entries(options.children || {})) { assert.ok(!specs.has(key), `duplicate declaration: ${key}`); specs.set(key, spec); }
      const entry = { component, ...options }; const list = entries.get(options.name) || []; entries.set(options.name, [...list, entry]);
      return () => { entries.set(options.name, (entries.get(options.name) || []).filter(item => item !== entry)); for (const key of Object.keys(options.children || {})) specs.delete(key); };
    },
  };
  const h = (type, props) => ({ type, props });
  const stop = executionMarkdown.mirrorExecutionPreviewSlots({ slots, createElement: h, target: 'finder.preview', rootKey: () => 'official-file' });
  const root = entries.get('finder.preview');
  assert.equal(root.length, 1, 'unrelated chat registrations are not mirrored');
  assert.equal(root[0].store, officialStore); assert.equal(root[0].inject, officialInject); assert.equal(root[0].locale, 'document');
  const childName = Object.keys(root[0].children)[0]; assert.notEqual(childName, 'sidebar.right.tab.document');
  const child = entries.get(childName); assert.equal(child.length, 1); assert.equal(child[0].key, 'mdstudio');
  const calls = [], wrapped = root[0].component({ renderSlot: (...args) => calls.push(args) });
  assert.equal(wrapped.type, OfficialFile); wrapped.props.renderSlot('sidebar.right.tab.document', {}, { entryKey: 'mdstudio' });
  assert.equal(calls[0][0], childName);
  stop();
  assert.deepEqual(entries.get('sidebar.right.pane.tab'), originalEntries);
  assert.equal(entries.get('finder.preview').length, 0); assert.equal(entries.get(childName).length, 0); assert.ok(!specs.has(childName));
  assert.ok([...subscriptions.values()].every(listeners => listeners.size === 0));
});
