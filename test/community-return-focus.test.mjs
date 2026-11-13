import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeView } from '../src/v8-home-view.js';
import { RETURN_KEY_ATTRIBUTE, rememberReturnPoint, restoreReturnPoint } from '../src/community-view.js';

// A bounded fake DOM: enough to model the real sequence (focus a home entry,
// unmount the home, rebuild it with fresh nodes, then restore). No screenshots
// and no browser are involved.
class FakeNode {
  constructor(doc, attrs = {}) {
    this.ownerDocument = doc;
    this.attributes = { ...attrs };
    this.childNodes = [];
    this.parentElement = null;
    this.isConnected = true;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
  }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? String(this.attributes[name]) : null; }
  get className() { return this.getAttribute('class') || ''; }
  focus() { if (this.isConnected) this.ownerDocument.activeElement = this; }
  appendChild(child) { child.parentElement = this; this.childNodes.push(child); }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (matches(node, selector)) return node;
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => {
      for (const child of node.childNodes) {
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  detach() {
    this.isConnected = false;
    for (const child of this.childNodes) child.detach();
    this.childNodes = [];
    this.parentElement = null;
  }
}

const matches = (node, selector) => {
  if (!node || typeof node !== 'object') return false;
  if (selector === '[data-plugin-finder]') return node.getAttribute('data-plugin-finder') !== null;
  if (selector === '.pf_root') return node.className.split(/\s+/).includes('pf_root');
  if (selector === `[${RETURN_KEY_ATTRIBUTE}]`) return Boolean(node.getAttribute(RETURN_KEY_ATTRIBUTE));
  throw new Error(`unsupported fake selector: ${selector}`);
};

const createDocument = () => {
  const doc = {
    activeElement: null,
    createElement: attrs => new FakeNode(doc, attrs),
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
  };
  doc.body = new FakeNode(doc);
  doc.activeElement = doc.body;
  return doc;
};

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const React = { createElement: h };
const HomeView = createHomeView(React);

const overview = {
  total: 42,
  fetchedAt: '2026-10-23T06:00:00.000Z',
  categories: [
    { id: 'content', label: '内容与输入', count: 6, previews: [] },
    { id: 'data', label: '数据与分析', count: 5, previews: [] },
  ],
};

const state = (patch = {}) => ({
  view: 'home', homeRequest: '还没提交的原话', history: [], historyTotal: 0,
  homeCommunityEntryId: null, plan: null, taskId: null, searching: false,
  installedPlugins: [], ...patch,
});

const props = (patch = {}) => ({
  state: state(), controller: { showHistory() {}, showFind() {}, showCatalogPlugin() {} },
  busy: false, modelReady: true, locked: false, homeInput: { current: null }, shortcut: null,
  resumeView: null, opportunityCard: null, opportunitySettings: null, fallbackIdea: null,
  featured: [], onFeatured() {}, featuredSettings: null, featuredWarning: '', onCommunity() {},
  overview, homeCommunityName: '', ...patch,
});

const resolve = node => typeof node?.type === 'function' ? resolve(node.type({ ...node.props, children: node.children })) : node;

const appendTree = (parent, node) => {
  const value = resolve(node);
  if (value == null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return;
  if (Array.isArray(value)) { for (const child of value) appendTree(parent, child); return; }
  const child = parent.ownerDocument.createElement(value.props || {});
  parent.appendChild(child);
  appendTree(child, value.children);
};

const mountHome = (doc, patch = {}, existing = null) => {
  const root = existing ?? doc.createElement({ className: 'pf_root', 'data-plugin-finder': 'true' });
  if (!existing) {
    root.scrollHeight = 1800;
    root.clientHeight = 600;
    root.scrollTop = 420;
    doc.body.appendChild(root);
  }
  for (const child of root.childNodes) child.detach();
  root.childNodes = [];
  appendTree(root, HomeView(props(patch)));
  return root;
};

const unmountHome = (doc, root) => {
  for (const child of root.childNodes) child.detach();
  root.childNodes = [];
  doc.activeElement = doc.body;
};

const keyNode = (root, key) => root.querySelectorAll(`[${RETURN_KEY_ATTRIBUTE}]`)
  .find(node => node.getAttribute(RETURN_KEY_ATTRIBUTE) === key);

const keys = root => root.querySelectorAll(`[${RETURN_KEY_ATTRIBUTE}]`)
  .map(node => node.getAttribute(RETURN_KEY_ATTRIBUTE));

test('returning from the store focuses the rebuilt 浏览全部插件 entry, not BODY', () => {
  const doc = createDocument(), root = mountHome(doc);
  const old = keyNode(root, 'home-store-browse');
  assert.ok(old, 'the keyboard entry must carry a stable key');
  old.focus();
  const point = rememberReturnPoint(doc);
  assert.equal(point.key, 'home-store-browse');
  assert.equal(point.focus, old);
  assert.equal(point.root, root);
  assert.deepEqual(point.positions.map(([, top]) => top), [420]);

  unmountHome(doc, root);
  assert.equal(old.isConnected, false);
  assert.equal(doc.activeElement, doc.body, 'the old node is gone before remount');

  mountHome(doc, {}, root);
  const rebuilt = keyNode(root, 'home-store-browse');
  assert.ok(rebuilt);
  assert.notEqual(rebuilt, old);
  const target = restoreReturnPoint(point, doc);
  assert.equal(target, rebuilt);
  assert.equal(doc.activeElement, rebuilt, 'focus must land on the same entry after the remount');
  assert.equal(root.scrollTop, 420, 'scroll restore still runs');
});

test('every home entry that opens the store carries a stable return key', () => {
  const doc = createDocument(), root = mountHome(doc);
  assert.deepEqual(new Set(keys(root)), new Set([
    'home-store-nav', 'home-store-browse', 'home-store-examples',
    'home-store-search', 'home-store-search-submit', 'home-store-category-content', 'home-store-category-data',
  ]));
  unmountHome(doc, root);

  const used = mountHome(doc, { state: state({
    history: [{ id: 'task-a', title: '上次那件事', planKind: 'single', updatedAt: '2026-10-22T09:00:00.000Z' }],
    historyTotal: 1,
  }) });
  assert.ok(keyNode(used, 'home-store-more'), 'the used-home 插件商店 link is keyed too');
});

test('each keyed home entry can be focused, unmounted and re-focused after the remount', () => {
  const used = state({ history: [{ id: 'task-a', title: '上次那件事', planKind: 'single', updatedAt: '2026-10-22T09:00:00.000Z' }], historyTotal: 1 });
  for (const key of ['home-store-nav', 'home-store-browse', 'home-store-more', 'home-store-examples', 'home-store-search', 'home-store-search-submit', 'home-store-category-content']) {
    const doc = createDocument();
    const root = mountHome(doc, { state: key === 'home-store-more' ? used : state() });
    const old = keyNode(root, key);
    assert.ok(old, `${key} must exist`);
    old.focus();
    const point = rememberReturnPoint(doc);
    assert.equal(point.key, key);
    unmountHome(doc, root);
    mountHome(doc, { state: key === 'home-store-more' ? used : state() }, root);
    const rebuilt = keyNode(root, key);
    assert.ok(rebuilt, `${key} must be rebuilt`);
    assert.equal(restoreReturnPoint(point, doc), rebuilt);
    assert.equal(doc.activeElement, rebuilt, `${key} must get the focus back`);
  }
});

test('an unkeyed return point never steals focus from BODY after the remount', () => {
  const doc = createDocument(), root = mountHome(doc);
  doc.body.focus();
  const point = rememberReturnPoint(doc);
  assert.equal(point.key, '');
  unmountHome(doc, root);
  mountHome(doc, {}, root);
  assert.equal(restoreReturnPoint(point, doc), doc.body, 'a body point resolves to body, not a random entry');
  assert.equal(doc.activeElement, doc.body);
});

test('a still-connected return point keeps the existing direct focus fallback', () => {
  const doc = createDocument(), root = mountHome(doc);
  const button = keyNode(root, 'home-store-browse');
  const target = restoreReturnPoint({ focus: button, key: '', positions: [] }, doc);
  assert.equal(target, button);
  assert.equal(doc.activeElement, button);
});
