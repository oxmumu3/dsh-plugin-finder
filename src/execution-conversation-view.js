const contentText = content => Array.isArray(content) ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '';

/** Conversation presentation only: it never changes the original execution's verdict. */
export function readExecutionConversation({ entries = [], requestId, session = {}, inbox = {}, pendingInteraction } = {}) {
  const messages = [], seen = new Set();
  let openTurn, lastEnd, latestActivity = '';
  for (const entry of entries) {
    const event = entry?.event, data = event?.data;
    if (!event || !data) continue;
    if (entry.type === 'transient') {
      if (event.type === 'assistant/live-chunk') latestActivity = '正在组织回复';
      continue;
    }
    if (entry.type !== 'event') continue;
    if (event.type === 'turn/start') { openTurn = data.turn; lastEnd = undefined; latestActivity = ''; }
    if (event.type === 'turn/end') { openTurn = undefined; lastEnd = data.reason; latestActivity = ''; }
    if (event.type === 'tool/call') latestActivity = '正在处理任务材料';
    const role = event.type === 'user/message' && data.source?.kind === 'user' ? 'user' : event.type === 'assistant/message' ? 'assistant' : undefined;
    if (!role || role === 'user' && typeof requestId === 'string' && requestId && data.source.rpcId === requestId) continue;
    const content = role === 'user' ? data.content : data.message?.content;
    const text = contentText(content) || (role === 'user' && content?.length ? '已补充附件' : '');
    const id = `${role}:${event.seq}`;
    if (!text || seen.has(id)) continue;
    seen.add(id);
    messages.push({ id, role, text, interrupted: data.interrupted === true });
  }
  const queue = ['next-turn', 'next-step'].flatMap(key => Array.isArray(inbox[key]) ? inbox[key] : []);
  const queued = queue.some(message => message?.source?.kind === 'user');
  let phase = 'waiting', summary = '正在读取会话，回复会出现在这里。', active = false;
  if (session.openState === 'error' || session.openError || session.removed) { phase = 'unavailable'; summary = '暂时无法读取最新会话，请稍后重新打开。'; }
  else if (pendingInteraction) { phase = 'waiting-user'; summary = '等待你确认，请在下方处理。'; active = true; }
  else if (session.running || session.awaitingFirstTurn || openTurn !== undefined) { phase = 'running'; summary = latestActivity || '正在处理，新的回复会出现在这里。'; active = true; }
  else if (queued) { phase = 'waiting'; summary = '补充已收到，正在等待处理。'; active = true; }
  else if (lastEnd) { phase = 'idle'; summary = lastEnd.kind === 'completed' ? '当前回复已结束，可以继续补充。' : '当前回复已停止，可查看记录或继续补充。'; }
  else if (messages.length) { phase = 'idle'; summary = '已读取当前会话记录。'; }
  return { messages, phase, summary, active };
}

/** Observe the caller-owned exact reference. This never retains/releases or sends. */
export function watchExecutionConversation({ reference, sessionId, requestId, sessions, sessionStatus }, onChange) {
  let disposed = false, currentBinding, sourceStops = [];
  const outerStops = [];
  const stopSources = () => { for (const stop of sourceStops.splice(0)) stop(); };
  const subscribe = (source, target) => {
    if (typeof source?.subscribe === 'function') {
      const stop = source.subscribe(refresh);
      if (typeof stop === 'function') target.push(stop);
    }
  };
  const resolveBinding = () => {
    try {
      const binding = reference?.binding;
      return sessionId && reference?.sessionId === sessionId && binding?.sessionId === sessionId && sessions?.binding?.(sessionId) === binding ? binding : undefined;
    } catch { return undefined; }
  };
  function refresh() {
    if (disposed) return;
    const binding = resolveBinding();
    if (binding !== currentBinding) {
      stopSources(); currentBinding = binding;
      if (binding) {
        subscribe(binding.eventSource, sourceStops); subscribe(binding.session, sourceStops);
        subscribe(binding.session.projections?.faceOf?.('inbox'), sourceStops);
      }
    }
    let snapshot;
    try {
      snapshot = binding ? readExecutionConversation({
        entries: binding.eventSource.getSnapshot().entries, requestId,
        session: binding.session.getSnapshot(), inbox: binding.session.projections?.faceOf?.('inbox')?.getSnapshot?.(),
        pendingInteraction: sessionStatus?.getSnapshot?.()?.get?.(sessionId)?.pendingInteraction,
      }) : { messages: [], phase: 'unavailable', active: false, summary: '正在重新连接当前会话。' };
    } catch { snapshot = { messages: [], phase: 'unavailable', active: false, summary: '暂时无法读取最新会话。' }; }
    if (!disposed) onChange({ ...snapshot, reference, sessionId, requestId });
  }
  subscribe(sessions?.list, outerStops); subscribe(sessionStatus, outerStops);
  refresh();
  Promise.resolve(reference?.ready).then(refresh, refresh);
  return () => {
    if (disposed) return;
    disposed = true; stopSources();
    for (const stop of outerStops.splice(0)) stop();
  };
}
