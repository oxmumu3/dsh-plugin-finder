/** Official DSH 0.2.1-rc.2 session adapter. No navigation, clipboard or permission answers. */
const acquisitions = new WeakMap();
const identity = value => typeof value === 'string' && value.trim() ? value : undefined;
const messageOf = (error, fallback = '未知错误') => {
  const message = [error?.message, error?.rpcError?.message, error?.error?.message, typeof error === 'string' ? error : undefined, error?.code].find(value => typeof value === 'string' && value.trim());
  return (message ?? fallback).slice(0, 600);
};
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const ownsMessage = (message, requestId) => message?.source?.kind === 'user' && message.source.rpcId === requestId;
const textOf = message => Array.isArray(message?.content) ? message.content.filter(part => part.type === 'text').map(part => part.text || '').join('\n') : '';

/** Resolve current main-view membership, an explicit fallback, or the sole workspace. */
export function inferWorkspace(ctx, selectedId) {
  try {
    const workspaces = ctx.workspaces?.list?.getSnapshot();
    const sessions = ctx.sessions?.list?.getSnapshot();
    if (workspaces?.phase !== 'ready' || sessions?.phase !== 'ready') return { workspaceId: '', reason: 'pending' };
    const items = Array.isArray(workspaces.items) ? workspaces.items : [];
    const current = Object.values(sessions.byId || {}).filter(row => (row?.retainedBy?.mainView ?? 0) > 0);
    if (current.length > 1) return { workspaceId: '', reason: 'ambiguous-current' };
    const matches = current.length === 1 ? items.filter(item => item.sessionIds?.includes(current[0].id)) : [];
    if (matches.length === 1) return { workspaceId: matches[0].workspaceId, workspace: matches[0], source: 'current-session', sessionId: current[0].id };
    if (matches.length > 1) return { workspaceId: '', reason: 'ambiguous-membership' };
    const chosen = items.find(item => item.workspaceId === selectedId);
    if (chosen) return { workspaceId: chosen.workspaceId, workspace: chosen, source: 'selected' };
    if (items.length === 1) return { workspaceId: items[0].workspaceId, workspace: items[0], source: 'only-workspace' };
    return { workspaceId: '', reason: items.length ? 'selection-required' : 'no-workspace' };
  } catch { return { workspaceId: '', reason: 'unavailable' }; }
}

function waitOrAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); resolve(undefined); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

/** Fold only this request's durable events; running=false and accepted are never success. */
function readEvidence(entries, requestId) {
  const queues = { 'next-turn': [], 'next-step': [] };
  const requestsByTurn = new Map();
  let openTurn, turn, admitted = false, cancelledUnrun = false, end, result = '', details = '';
  for (const entry of entries || []) {
    if (entry.type !== 'event') continue;
    const event = entry.event;
    if (!event?.data) continue;
    const data = event.data;
    if (event.type === 'turn/start') { openTurn = data.turn; continue; }
    if (event.type === 'agent/inbox/spliced' && queues[data.target]) {
      const removed = queues[data.target].splice(data.start, data.removedCount ?? 0, ...(data.inserted || []));
      if (data.outcome === 'canceled' && removed.some(item => ownsMessage(item, requestId)) && !data.inserted?.some(item => ownsMessage(item, requestId))) cancelledUnrun = true;
      continue;
    }
    if (event.type === 'user/message') {
      // Host runtime/skill/time context also uses user/message; only human user
      // sources participate in request ownership. Missing user rpcId stays unknown.
      if (openTurn !== undefined && data.source?.kind === 'user') {
        const requests = requestsByTurn.get(openTurn) || new Set();
        requests.add(data.source?.rpcId ?? null); requestsByTurn.set(openTurn, requests);
      }
      if (ownsMessage(data, requestId)) { admitted = true; turn = openTurn; }
    }
    if (turn !== undefined && data.turn === turn) {
      if (event.type === 'tool/call') details = `正在调用 ${String(data.name || '工具')}`;
      if (event.type === 'assistant/message' && !data.interrupted) { const value = textOf(data.message); if (value) result = value; }
      if (event.type === 'turn/end') end = data.reason;
    }
    if (event.type === 'turn/end') openTurn = undefined;
  }
  const activeRequests = requestsByTurn.get(openTurn);
  return { admitted, turn, cancelledUnrun, end, result, details,
    ownsActiveTurn: turn !== undefined && openTurn === turn && activeRequests?.size === 1 && activeRequests.has(requestId) };
}

/**
 * Begin one claimed execution or observe an existing association. Awaiting this function
 * waits for preparation/admission, not model completion. On signal abort it returns early;
 * handle.ready still persists any late create result. onReference must resolve only after
 * the official scoped approval UI is mounted. record must reject unsuccessful persistence.
 */
export async function executeInWorkspace(ctx, options = {}) {
  const { attempt = {}, acquired = false, allowSubmit = false, record, prepareExecution, claimSubmission, claimCancellation, onReference, onStatus, onHandle, signal } = options;
  const canAcquire = acquired === true && attempt.provenance === 'local' && attempt.status === 'claimed' && !identity(attempt.sessionId);
  const canResume = allowSubmit === true && attempt.provenance === 'local' && attempt.status === 'created' && Boolean(identity(attempt.sessionId));
  const wantsSubmission = canAcquire || canResume;
  let cache;
  if (ctx?.sessions && canAcquire) {
    cache = acquisitions.get(ctx.sessions);
    if (!cache) { cache = new Map(); acquisitions.set(ctx.sessions, cache); }
    const previous = cache.get(attempt.attemptId);
    if (previous) { onHandle?.(previous); return previous; }
  }

  let sessionId = identity(attempt.sessionId), reference, binding, recoveryRecord;
  let disposed = false, cancelled = Boolean(signal?.aborted), promptAttempted = false, submitted = attempt.status === 'submitted';
  let recordStatus = attempt.status, submissionOwned = false;
  let state = { phase: 'preparing', summary: '正在准备执行', terminal: false, sessionId, requestId: attempt.requestId };
  let ready, cancellation, preparationCancellation, installationController, cancellationDirty = false, lastCancelKey, mounted = false;
  const removedQueueIds = new Set(), listeners = new Set(), unsubscribe = [];
  const finished = deferred();
  const emit = patch => {
    if (disposed || state.terminal && !patch.allowAfterTerminal) return;
    state = { ...state, canContinue: false, ...patch, sessionId, requestId: attempt.requestId };
    delete state.allowAfterTerminal;
    try { onStatus?.(state); } catch { /* Presentation errors cannot repeat a submission. */ }
    for (const listener of [...listeners]) { try { listener(); } catch { /* isolate observers */ } }
    if (state.terminal) finished.resolve(state);
  };
  const exact = () => !disposed && binding?.sessionId === sessionId && ctx.sessions.binding(sessionId) === binding;
  const save = async (status, message) => {
    const row = { attemptId: attempt.attemptId, requestId: attempt.requestId, taskId: attempt.taskId, revisionId: attempt.revisionId, kind: attempt.kind, workspaceId: attempt.workspaceId, status, ...(sessionId ? { sessionId } : {}), ...(message ? { message } : {}) };
    try {
      if (typeof record !== 'function') throw new Error('执行记录服务不可用');
      const result = await record(row);
      if (result?.saved === false) throw new Error('执行记录未保存');
      const canonical = result?.attempt ?? result;
      if (!canonical || ['attemptId', 'requestId', 'taskId', 'revisionId', 'kind', 'workspaceId'].some(key => canonical[key] !== row[key]) || sessionId && canonical.sessionId !== sessionId) throw new Error('执行记录回执身份不一致');
      recordStatus = canonical.status;
      recoveryRecord = undefined;
      if (canonical.status !== status) {
        if (canonical.status === 'submitted') {
          submitted = true;
          emit({ phase: 'submitted', summary: '原请求已提交，正在核对执行结果' });
        } else if (canonical.status === 'cancelled' || canonical.status === 'failed') {
          if (promptAttempted) {
            cancelled ||= canonical.status === 'cancelled';
            emit({ phase: cancelled ? 'cancelling' : 'unknown', summary: cancelled ? '正在停止，等待宿主确认' : '提交后状态已变化，正在核对宿主', details: canonical.message });
          } else emit({ phase: canonical.status, summary: '这次执行已停止准备，未再次发送', terminal: true, details: canonical.message });
        } else emit({ phase: 'unknown', summary: '执行记录已变化，未继续发送', details: `当前记录状态：${String(canonical.status)}` });
        return false;
      }
      return true;
    } catch (error) {
      recoveryRecord = row;
      emit({ phase: 'record-failed', summary: '执行关联尚未保存', details: messageOf(error), recoveryRecord: row });
      return false;
    }
  };
  const queued = () => {
    const inbox = binding?.session.projections?.faceOf?.('inbox')?.getSnapshot?.();
    return ['next-turn', 'next-step'].flatMap(key => Array.isArray(inbox?.[key]) ? inbox[key] : []).filter(item => ownsMessage(item, attempt.requestId));
  };
  const evidence = () => readEvidence(binding?.eventSource?.getSnapshot?.().entries, attempt.requestId);
  const recoverHistory = async () => {
    // Official loadOlder() prepends one bounded page and resolves void. loadThrough(seq)
    // may page without a bound, so never guess a target sequence for a missing request.
    for (let page = 0; page < 5 && exact() && !state.terminal; page++) {
      const facts = evidence(), before = binding.eventSource.getSnapshot();
      if (facts.turn !== undefined || facts.cancelledUnrun || !before.hasMore || typeof binding.session.loadOlder !== 'function') break;
      const firstSeq = before.entries.find(entry => entry.type === 'event')?.event.seq;
      emit({ phase: cancelled ? 'cancelling' : 'preparing', summary: cancelled ? '正在核对原请求以停止执行' : '正在读取原执行记录', historyPages: page });
      await binding.session.loadOlder();
      if (!exact()) return;
      const after = binding.eventSource.getSnapshot();
      const nextSeq = after.entries.find(entry => entry.type === 'event')?.event.seq;
      if (after.hasMore && (nextSeq === undefined || firstSeq !== undefined && nextSeq >= firstSeq)) break;
    }
  };
  const observe = () => {
    if (disposed || state.terminal) return;
    if (!exact()) { emit({ phase: 'unknown', summary: '会话连接已变化，正在等待重新连接', details: '未向其他会话提交。' }); return; }
    const snapshot = binding.session.getSnapshot();
    const facts = evidence();
    if (facts.end) {
      const kind = facts.end.kind;
      const phase = kind === 'completed' ? 'completed' : ['aborted', 'interrupted'].includes(kind) ? 'cancelled' : 'failed';
      emit({ phase, terminal: true, summary: phase === 'completed' ? '执行已结束' : phase === 'cancelled' ? '执行已停止' : '执行未完成', result: facts.result, details: kind === 'completed' ? '' : messageOf(facts.end.error || facts.end.reason, phase === 'cancelled' ? '' : '宿主未提供可读错误详情。'), endReason: facts.end, turn: facts.turn });
      return;
    }
    if (facts.cancelledUnrun && queued().length === 0 && snapshot.running !== true) {
      emit({ phase: 'cancelled', terminal: true, summary: '请求已从队列移除', details: '已核对真实取消记录，任务未继续运行。' }); return;
    }
    if (snapshot.openError || snapshot.openState === 'error' || snapshot.removed) {
      emit({ phase: 'unknown', summary: '暂时无法确认执行状态', details: messageOf(snapshot.openError || (snapshot.removed ? '会话已不可用' : '读取会话失败')) }); return;
    }
    const pending = ctx.uiSession?.sessionStatus?.getSnapshot?.()?.get?.(sessionId)?.pendingInteraction;
    if (cancelled) emit({ phase: 'cancelling', summary: '正在停止，等待宿主确认', terminal: false, result: facts.result });
    else if (pending) emit({ phase: 'waiting-user', summary: '等待你确认', details: '请在下方官方交互中处理。', result: facts.result });
    else if (facts.turn !== undefined) emit({ phase: 'running', summary: '正在执行', details: facts.details, result: facts.result, turn: facts.turn });
    else if (!canAcquire && queued().length === 0 && recordStatus === 'created' && attempt.provenance === 'local') emit({ phase: 'ready', canContinue: true, summary: '执行已准备好，尚未发送', details: '点击继续执行，会沿用这次会话和已保存的方案。' });
    else if (!canAcquire && !submissionOwned && queued().length === 0) emit({ phase: 'unknown', summary: '原执行结果尚未确认', details: '当前记录尚未定位原请求及其执行轮次，不会重复发送。' });
    else if (submitted) emit({ phase: 'submitted', summary: '请求已接受，等待执行', result: facts.result });
    if (cancelled && !state.terminal) void cancelActivity();
  };

  // cancel() does not remove queued work. Remove only occurrences with this requestId,
  // and revisit when a late admission publishes an inbox or running-state change.
  const cancelActivity = async () => {
    if (!exact() || state.terminal) return { accepted: false, reason: 'not-active' };
    if (attempt.provenance !== 'local') return { accepted: false, reason: 'read-only-import' };
    if (cancellation) { cancellationDirty = true; return cancellation; }
    cancellation = Promise.resolve().then(async () => {
      let accepted = false;
      do {
        cancellationDirty = false;
        if (!exact() || state.terminal) break;
        for (const item of queued()) {
          if (!identity(item.id) || removedQueueIds.has(item.id)) continue;
          if (typeof binding.session.updateQueue !== 'function') { emit({ phase: 'cancelling', summary: '等待宿主确认停止', details: '当前宿主无法移除尚未执行的请求。' }); continue; }
          removedQueueIds.add(item.id);
          try {
            const result = await binding.session.updateQueue(item.id, { kind: 'remove' });
            if (!result?.ok) { removedQueueIds.delete(item.id); emit({ phase: 'cancelling', summary: '尚未确认停止', details: messageOf(result?.error) }); }
          } catch (error) { removedQueueIds.delete(item.id); emit({ phase: 'cancelling', summary: '尚未确认停止', details: messageOf(error) }); }
        }
        const facts = evidence();
        // Session cancel affects its entire active turn. A queue occurrence alone
        // grants no authority to interrupt somebody else's currently running input.
        if (!facts.ownsActiveTurn) continue;
        const key = `${facts.turn}:${queued().map(item => item.id).join(',')}`;
        if (key !== lastCancelKey) {
          lastCancelKey = key;
          try { const result = await binding.session.cancel(); accepted ||= result?.ok === true; if (!result?.ok) emit({ phase: 'cancelling', summary: '尚未确认停止', details: messageOf(result?.error) }); }
          catch (error) { emit({ phase: 'cancelling', summary: '尚未确认停止', details: messageOf(error) }); }
        }
      } while (cancellationDirty);
      return { accepted, confirmed: state.phase === 'cancelled' && state.terminal };
    });
    try { return await cancellation; } finally {
      cancellation = undefined;
      // An event may arrive after the loop's last await but before this finally.
      if (cancellationDirty && exact() && !state.terminal) void cancelActivity();
    }
  };

  const cancelPreparation = () => {
    if (preparationCancellation) return preparationCancellation;
    preparationCancellation = (async () => {
      try {
        if (typeof claimCancellation !== 'function') throw new Error('停止准备服务不可用');
        const row = { attemptId: attempt.attemptId, requestId: attempt.requestId, taskId: attempt.taskId, revisionId: attempt.revisionId, kind: attempt.kind, workspaceId: attempt.workspaceId, sessionId };
        const grant = await claimCancellation(row), canonical = grant?.attempt;
        if (!canonical || Object.keys(row).some(key => canonical[key] !== row[key]) || canonical.provenance !== 'local' || !['acquired', 'existing'].includes(grant.claim)) throw new Error('停止准备回执身份不一致');
        if (grant.claim === 'acquired' && canonical.status !== 'cancelled') throw new Error('停止准备状态未确认');
        recordStatus = canonical.status;
        if (grant.claim === 'acquired') {
          emit({ phase: 'cancelled', summary: '已取消，未提交执行', terminal: true });
          return { accepted: true, confirmed: true };
        }
        // Another connection may already own submission. Only the exact request's
        // durable events/queue can establish cancellation from this point onward.
        return { accepted: false, confirmed: false };
      } catch (error) {
        emit({ phase: 'unknown', summary: '停止准备的结果尚未确认', details: messageOf(error) });
        return { accepted: false, confirmed: false, unknown: true };
      }
    })();
    return preparationCancellation;
  };

  const handle = {
    get sessionId() { return sessionId; }, requestId: attempt.requestId,
    get reference() { return reference; }, get ready() { return ready; }, completion: finished.promise,
    get recoveryRecord() { return recoveryRecord; },
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async cancel() {
      if (disposed || state.terminal) return { accepted: false, confirmed: state.phase === 'cancelled' };
      if (attempt.provenance !== 'local') return { accepted: false, reason: 'read-only-import' };
      cancelled = true;
      installationController?.abort('cancelled');
      emit({ phase: 'cancelling', summary: '正在停止，等待宿主确认' });
      if (!promptAttempted && !submissionOwned && recordStatus === 'created' && sessionId) {
        const stopped = await cancelPreparation();
        if (stopped.confirmed || stopped.unknown) return stopped;
      }
      if (!promptAttempted && !sessionId) return { accepted: true, confirmed: false };
      lastCancelKey = undefined;
      return cancelActivity();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of unsubscribe.splice(0)) { try { stop(); } catch { /* all observers must release */ } }
      reference?.release(); listeners.clear(); signal?.removeEventListener('abort', abort);
      if (!state.terminal) finished.resolve({ ...state, phase: 'detached', terminal: false, summary: '已停止观察，宿主执行状态未改变' });
    },
  };
  if (cache) cache.set(attempt.attemptId, handle);
  const abort = () => { void handle.cancel(); };
  signal?.addEventListener('abort', abort, { once: true });
  const cancelledBeforeSend = async () => {
    // Closing detaches and blocks a send; it does not revoke the saved attempt.
    // A late create remains resumable, while an acquired submit claim stays
    // submitting and cannot be claimed again. Only an explicit stop is cancelled.
    if (!cancelled) return disposed;
    if (!submissionOwned && (preparationCancellation || recordStatus === 'created')) {
      const stopped = await cancelPreparation();
      if (stopped.confirmed || stopped.unknown) return true;
    }
    if (!submissionOwned) {
      if (exact()) { observe(); await cancelActivity(); return true; }
      // A competing submit may have won before binding was ready. Finish binding
      // so the original request can still be observed/stopped, without sending.
      return disposed;
    }
    if (sessionId && !await save('cancelled', '提交前已取消')) return true;
    emit({ phase: 'cancelled', summary: '已取消，未提交执行', terminal: true });
    return true;
  };
  const subscribe = source => { if (typeof source?.subscribe === 'function') unsubscribe.push(source.subscribe(observe)); };

  ready = (async () => {
    try {
      if (!identity(attempt.attemptId) || !identity(attempt.requestId) || !identity(attempt.workspaceId) || !['use', 'create'].includes(attempt.kind)) { emit({ phase: 'blocked', summary: '执行关联信息不完整' }); return; }
      if (wantsSubmission && (typeof record !== 'function' || typeof claimSubmission !== 'function')) { emit({ phase: 'blocked', summary: '首次执行授权服务不可用' }); return; }
      if (!ctx.sessions?.retain || !ctx.sessions?.binding || !ctx.workspaces?.list?.getSnapshot || typeof onReference !== 'function') { emit({ phase: 'blocked', summary: '宿主执行或官方权限界面不可用' }); return; }
      if (canAcquire) {
        if (cancelled || disposed) { emit({ phase: 'cancelled', summary: '已取消，未提交执行', terminal: true }); return; }
        if (typeof ctx.sessions.create !== 'function') { emit({ phase: 'blocked', summary: '宿主不支持创建执行会话' }); return; }
        try { sessionId = identity(await ctx.sessions.create({ workspaceId: attempt.workspaceId, agentPreset: attempt.kind === 'create' ? 'cordis' : 'standard' })); }
        catch (error) {
          sessionId = identity(error?.rpcError?.details?.sessionId);
          if (sessionId) await save('created', '会话已创建，但工作区关联尚未确认');
          emit({ phase: sessionId ? 'blocked' : 'unknown', summary: sessionId ? '会话工作区关联未完成' : '会话创建结果尚未确认', details: messageOf(error) }); return;
        }
        if (!sessionId) { emit({ phase: 'unknown', summary: '会话创建结果尚未确认' }); return; }
        if (!await save('created')) return;
        if (await cancelledBeforeSend()) return;
      } else if (!sessionId) { emit({ phase: 'unknown', summary: '已有执行正在准备或结果尚未确认', details: '不会重复创建或发送。' }); return; }
      if (disposed) return;
      reference = ctx.sessions.retain(sessionId, { source: 'controllerOperation' });
      // The outer call may return on abort, but binding verification never skips readiness.
      await reference.ready;
      if (wantsSubmission && await cancelledBeforeSend()) return;
      if (disposed) return;
      binding = reference.binding;
      if (!exact()) { emit({ phase: 'blocked', summary: '执行会话绑定已变化' }); return; }
      const preset = binding.session.projections?.faceOf?.('agentPreset')?.getSnapshot?.();
      const expected = attempt.kind === 'create' ? 'cordis' : 'standard';
      if (preset !== expected) { emit({ phase: 'blocked', summary: '执行会话类型未核实', details: `需要 ${expected}` }); return; }
      const workspaces = ctx.workspaces.list.getSnapshot();
      if (workspaces?.phase !== 'ready' || !workspaces.items?.some(ws => ws.workspaceId === attempt.workspaceId && ws.sessionIds?.includes(sessionId))) { emit({ phase: 'blocked', summary: '执行会话工作区尚未核实' }); return; }
      if (typeof binding.session.prompt !== 'function' || typeof binding.session.cancel !== 'function' || !binding.eventSource?.getSnapshot || !binding.session.getSnapshot) { emit({ phase: 'blocked', summary: '宿主缺少执行或进度接口' }); return; }
      subscribe(binding.session); subscribe(binding.eventSource); subscribe(binding.session.projections.faceOf('inbox')); subscribe(ctx.uiSession?.sessionStatus);
      if (cancelled && !submissionOwned) { await recoverHistory(); observe(); await cancelActivity(); return; }
      await waitOrAbort(Promise.resolve(onReference(reference)), signal);
      if (wantsSubmission && await cancelledBeforeSend()) return;
      if (!exact()) { emit({ phase: 'blocked', summary: '执行会话绑定已变化' }); return; }
      mounted = true;
      if (!canAcquire) await recoverHistory();
      observe();
      if (!wantsSubmission || state.terminal || evidence().admitted || queued().length > 0) {
        if (!state.terminal && !submitted && !evidence().admitted && recordStatus !== 'created') emit({ phase: 'unknown', summary: '原执行结果尚未确认', details: '正在观察已关联的会话，不会重复创建或发送。' });
        return;
      }
      if (attempt.kind === 'use') {
        if (typeof prepareExecution !== 'function') throw new Error('插件准备服务不可用，请重新打开原方案。');
        emit({ phase: 'preparing', summary: '正在准备方案需要的插件', details: '自动安装并启用，准备好后继续当前工作区的任务。' });
        const row = { attemptId: attempt.attemptId, requestId: attempt.requestId, taskId: attempt.taskId, revisionId: attempt.revisionId, kind: attempt.kind, workspaceId: attempt.workspaceId, sessionId };
        installationController = new AbortController();
        let prepared;
        try { prepared = await waitOrAbort(Promise.resolve(prepareExecution(row, installationController.signal)), signal); }
        catch (error) { if (await cancelledBeforeSend() || disposed) return; throw error; }
        finally { installationController = undefined; }
        if (await cancelledBeforeSend() || disposed) return;
        const verified = prepared?.attempt;
        if (prepared?.ready !== true || !verified || Object.keys(row).some(key => verified[key] !== row[key]) || verified.status !== 'created' || verified.provenance !== 'local') throw new Error('插件准备结果尚未确认，任务没有发送。请在原方案重试。');
        if (!exact() || !mounted) throw new Error('执行界面连接已变化，任务没有发送。');
      }
      let canonical;
      try {
        const row = { attemptId: attempt.attemptId, requestId: attempt.requestId, taskId: attempt.taskId, revisionId: attempt.revisionId, kind: attempt.kind, workspaceId: attempt.workspaceId, sessionId };
        const grant = await claimSubmission(row);
        canonical = grant?.attempt;
        if (!canonical || Object.keys(row).some(key => canonical[key] !== row[key]) || !['acquired', 'existing'].includes(grant.claim)) throw new Error('首次执行授权回执不一致');
        recordStatus = canonical.status;
        if (grant.claim !== 'acquired') {
          submitted = canonical.status === 'submitted';
          emit({ phase: 'unknown', summary: '原请求已由其他连接接续，正在核对状态' }); observe(); return;
        }
        if (canonical.status !== 'submitting' || canonical.provenance !== 'local' || !identity(canonical.prompt)) throw new Error('首次执行授权内容不完整');
        submissionOwned = true;
      } catch (error) {
        // A lost claim response may already have committed submitting. Never
        // turn it into a retryable created state or replay it as a save record.
        recordStatus = 'submitting';
        emit({ phase: 'unknown', summary: '首次执行授权结果尚未确认', details: messageOf(error) }); return;
      }
      if (await cancelledBeforeSend()) return;
      if (!exact() || !mounted) { emit({ phase: 'blocked', summary: '执行界面尚未就绪' }); return; }
      emit({ phase: 'submitting', summary: '正在提交执行' });
      promptAttempted = true;
      let result;
      try { result = await binding.session.prompt([{ type: 'text', text: canonical.prompt }], 'queue', signal, attempt.requestId); }
      catch (error) { await save('submitting', `提交结果未知：${messageOf(error)}`); emit({ phase: cancelled ? 'cancelling' : 'unknown', summary: cancelled ? '正在停止，等待宿主确认' : '提交结果尚未确认', details: '保留原会话和请求标识，不会重复发送。' }); observe(); return; }
      if (result?.ok === true && result.value?.accepted === true) {
        submitted = true;
        await save('submitted');
        emit({ phase: cancelled ? 'cancelling' : 'submitted', summary: cancelled ? '正在停止，等待宿主确认' : '请求已接受，等待执行' });
      } else {
        await save('submitting', `提交结果未确认：${messageOf(result?.error)}`);
        emit({ phase: cancelled ? 'cancelling' : 'unknown', summary: cancelled ? '正在停止，等待宿主确认' : '提交未确认', details: messageOf(result?.error) });
      }
      observe();
    } catch (error) { emit({ phase: promptAttempted ? 'unknown' : 'blocked', canContinue: !promptAttempted && recordStatus === 'created' && attempt.provenance === 'local', summary: promptAttempted ? '执行状态尚未确认' : '暂时无法开始执行', details: messageOf(error) }); }
    finally { if (cancelled && promptAttempted && exact() && !state.terminal) void cancelActivity(); }
  })();
  onHandle?.(handle);
  await waitOrAbort(ready, signal);
  return handle;
}
