// Official 0.2.1-rc.2 ui-chat/lib/client.js:13243-13248 uses this resource
// address grammar with sidebarRight.openResource, including optional line params.
function fileAddressFor(sessionId, cwd, path) {
  let normalized = path.replace(/\\/g, '/');
  const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
  const root = typeof cwd === 'string' ? cwd.replace(/\\/g, '/').replace(/\/+$/, '') : '';
  if (absolute && root && normalized === root) normalized = '';
  else if (absolute && root && normalized.startsWith(`${root}/`)) normalized = normalized.slice(root.length + 1);
  normalized = normalized.replace(/^(?:\.\/)+/, '');
  const encodeSegment = value => encodeURIComponent(value).replace(/%3A/gi, ':');
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`;
}

/** The official Markdown delegate receives an already decoded local destination. */
export function createExecutionFileOpener({ reference, sessionId, sessions, sidebarRight, onError }) {
  return async (path, options) => {
    try {
      const binding = reference?.binding;
      if (!sessionId || reference?.sessionId !== sessionId || binding?.sessionId !== sessionId || sessions?.binding?.(sessionId) !== binding) throw new Error('执行会话连接已变化，请重新打开后查看文件。');
      if (typeof path !== 'string' || !path || typeof sidebarRight?.openResource !== 'function') throw new Error('当前宿主暂时无法打开此文件。');
      const cwd = sessions.list?.getSnapshot?.().byId?.[sessionId]?.cwd;
      const address = fileAddressFor(sessionId, cwd, path);
      if (Number.isSafeInteger(options?.line) && options.line > 0) await sidebarRight.openResource(address, { params: { line: options.line } });
      else await sidebarRight.openResource(address);
      onError?.('');
      return true;
    } catch (error) {
      onError?.(String(error?.message || '文件暂时无法打开。').slice(0, 300));
      return false;
    }
  };
}

/** A single session-scoped preview occurrence, drawn inside Finder rather than
 * the global sidebar (whose public navigation deliberately targets mainView).
 * The registered official tab body still owns all file reads and renderers. */
export function createExecutionPreviewSurface({ reference, sessionId, sessions, sidebarRightTabs }) {
  let snapshot = null, controller, disposed = false, sequence = 0;
  const occurrenceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const listeners = new Set();
  const exact = () => {
    const binding = reference?.binding;
    if (disposed || !sessionId || reference?.sessionId !== sessionId || binding?.sessionId !== sessionId || sessions?.binding?.(sessionId) !== binding) throw new Error('预览会话连接已变化，请重新打开当前运行。');
  };
  const notify = () => { for (const listener of [...listeners]) listener(); };
  const close = () => { controller?.abort(); controller = undefined; snapshot = null; notify(); };
  const openResource = (address, options = {}) => {
    exact();
    const destination = typeof address === 'string' && /^dsh-resource:\/\/file\/session\/([^/]+)\//.exec(address);
    if (!destination || decodeURIComponent(destination[1]) !== sessionId) throw new Error('只能在当前执行会话中预览文件。');
    if (typeof sidebarRightTabs?.claim !== 'function' || typeof sidebarRightTabs?.get !== 'function') throw new Error('宿主官方文件预览尚未就绪。');
    const claim = sidebarRightTabs.claim(address), definition = sidebarRightTabs.get(claim.kind);
    if (!definition?.id) throw new Error('没有找到此文件的官方预览界面。');
    const sameFile = snapshot?.address === address && snapshot.entryKey === definition.id;
    const revision = sameFile ? snapshot.navigation.revision + 1 : 1;
    if (!sameFile) { controller?.abort(); controller = new AbortController(); }
    const signal = controller.signal, tabId = sameFile ? snapshot.tabId : `finder-file-${occurrenceId}-${++sequence}`;
    const navigation = { address, params: options.params, revision };
    const tab = { id: tabId, kind: claim.kind, contentId: claim.contentId, title: claim.title };
    const paneId = `finder-file-pane-${sessionId}`;
    const state = { bySession: { [sessionId]: { layout: { expanded: true, activePaneId: paneId, tabs: { [tabId]: tab } } } } };
    let commands;
    const actions = {
      bindCommands(value) { if (signal.aborted) return () => {}; commands = value; return () => { if (commands === value) commands = undefined; }; },
      openResource(value, placement) { if (!signal.aborted) openResource(value, placement); },
      openTab() { throw new Error('当前文件预览只打开本次运行的文件。'); },
      close() { if (!signal.aborted && snapshot?.tabId === tabId) close(); },
    };
    const hookContext = {
      tabId, shortcuts: [], title: false, fullscreen: false, active: true, signal, actions,
      useStore: selector => selector(state),
      useTabNavigation: key => key === tabId ? navigation : undefined,
    };
    snapshot = { sessionId, tabId, entryKey: definition.id, title: claim.title, address, navigation, hookContext };
    notify();
  };
  return {
    openResource, close, getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { if (disposed) return; disposed = true; controller?.abort(); snapshot = null; listeners.clear(); },
  };
}

/** Public Slot hookContext adapter for the one committed local file occurrence.
 * This is the same Tab API consumed by the host's registered DocumentPreview. */
export function executionPreviewTabInfoFactory({ sessionId }, context) {
  return function useTabInfo() {
    const layout = context.useStore(state => state.bySession[sessionId]?.layout);
    const tab = layout?.tabs[context.tabId], navigation = context.useTabNavigation(context.tabId);
    if (!tab || !navigation || context.signal.aborted) throw new Error('文件预览与当前会话不一致。');
    return { sidebar: { expanded: true, fullscreen: false }, panel: { id: layout.activePaneId },
      tab: { ...tab, visible: true, navigation, signal: context.signal, actions: context.actions } };
  };
}

/** Reuse the host's registered file body and renderer descendants without
 * redeclaring or mutating its globally owned Slot names. All public metadata
 * comes from entriesOfSlot(); every new declaration belongs to Finder. */
export function mirrorExecutionPreviewSlots({ slots, createElement, target, rootKey }) {
  const sourceRoot = 'sidebar.right.pane.tab';
  const privateName = name => name === sourceRoot ? target : `${target}.${name}`;
  const mount = (source, destination, root = false) => {
    const records = new Map();
    let stopped = false;
    const reconcile = () => {
      if (stopped) return;
      const entries = slots.entriesOfSlot(source).filter(entry => !root || entry.options.key === rootKey());
      for (const [entry, release] of records) if (!entries.includes(entry)) { release(); records.delete(entry); }
      for (const entry of entries) {
        if (records.has(entry)) continue;
        const children = Object.fromEntries(Object.entries(entry.children || {}).map(([name, spec]) => [privateName(name), spec]));
        const releases = [];
        try {
          const options = { name: destination, ...entry.options,
            ...(entry.store === undefined ? {} : { store: entry.store }),
            ...(entry.inject === undefined ? {} : { inject: entry.inject }),
            ...(entry.locale === undefined ? {} : { locale: entry.locale }),
            ...(entry.select === undefined ? {} : { select: entry.select }),
            ...(Object.keys(children).length ? { children } : {}),
          };
          const Wrapped = props => {
            const mapped = { ...props };
            for (const method of ['renderSlot', 'renderSlotChain']) if (typeof props[method] === 'function') {
              mapped[method] = (name, ...args) => props[method](entry.children?.[name] ? privateName(name) : name, ...args);
            }
            return createElement(entry.component, mapped);
          };
          releases.push(slots.register(options, Wrapped));
          for (const name of Object.keys(entry.children || {})) releases.push(mount(name, privateName(name)));
          records.set(entry, () => { for (const release of releases.reverse()) release(); });
        } catch (error) { for (const release of releases.reverse()) release(); throw error; }
      }
    };
    const unsubscribe = slots.subscribe(source, reconcile);
    try { reconcile(); } catch (error) { unsubscribe(); for (const release of records.values()) release(); throw error; }
    return () => { if (stopped) return; stopped = true; unsubscribe(); for (const release of records.values()) release(); records.clear(); };
  };
  return mount(sourceRoot, target, true);
}

const markdownLabels = {
  code: { copyLabel: '复制', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '取消换行' } },
  footnotes: '脚注',
};

/** Whole Markdown source goes to the official renderer; no HTML or URL rewriting. */
export function renderExecutionAssistant(h, { MarkdownText, MarkdownDelegateProvider }, text, openFile) {
  return h(MarkdownDelegateProvider, { openFile }, h(MarkdownText, { text, streaming: false, labels: markdownLabels }));
}
