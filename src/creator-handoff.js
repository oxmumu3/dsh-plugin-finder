const supportedHost = '0.2.1-rc.2';
const localAttempts = new WeakMap();
const identity = value => typeof value === 'string' && value.trim() ? value : undefined;
const stopped = Symbol('cancelled');

/** Cancel the caller's wait, never the create or persistence operation itself. */
function waitFor(value, signal) {
  const promise = Promise.resolve(value);
  if (!signal) return promise;
  if (signal.aborted) { promise.catch(() => {}); return Promise.resolve(stopped); }
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); resolve(stopped); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(result => {
      signal.removeEventListener('abort', abort);
      resolve(signal.aborted ? stopped : result);
    }, error => {
      signal.removeEventListener('abort', abort);
      signal.aborted ? resolve(stopped) : reject(error);
    });
  });
}

/**
 * Prepare ordinary unsent text in a newly claimed, verified official Creator.
 *
 * `attempt` is the persisted server claim, not a client-generated identity.
 * Only its acquired creating state may call create. `record` must add the
 * claim's source identity and persist without using this operation's signal.
 * A cancelled result can carry `completion`: it always settles to the late
 * create/record result, including a recoverable ID if persistence failed.
 * `recoveryRecord` is save-only recovery; never retry create or injection.
 */
export async function prepareCreatorDraft(ctx, options = {}) {
  const { workspaceId, prompt, hostVersion, attempt, record, signal, stillCurrent = () => true } = options;
  const attemptId = identity(attempt?.attemptId);
  const base = { ...(attemptId ? { attemptId } : {}) };
  const current = () => !signal?.aborted && stillCurrent();
  const cancelled = (extra = {}) => ({ ...base, ...extra, status: 'cancelled' });
  if (!attemptId) return { ...base, status: 'blocked', reason: 'missing-attempt' };
  if (!current()) return cancelled({ ...(identity(attempt.sessionId) ? { sessionId: attempt.sessionId } : {}) });

  // A saved identity is never a request to create or initialize again. Opening
  // an attach-failed identity remains possible without claiming it was fixed.
  if (identity(attempt.sessionId)) {
    const sessionId = attempt.sessionId;
    if (typeof ctx?.uiWorkspace?.openSession !== 'function' || typeof ctx?.layout?.selectPanel !== 'function') {
      return { ...base, status: 'blocked', sessionId, reason: 'navigation-unavailable' };
    }
    try {
      ctx.uiWorkspace.openSession(sessionId);
      if (!current()) return cancelled({ sessionId });
      ctx.layout.selectPanel(null);
      return { ...base, status: 'opened', sessionId, operationStatus: attempt.status };
    } catch {
      return { ...base, status: 'blocked', sessionId, reason: 'navigation-failed' };
    }
  }
  if (hostVersion !== supportedHost) return { ...base, status: 'unsupported', reason: 'host-version' };
  if (attempt.acquired !== true || attempt.status !== 'creating') {
    return { ...base, status: attempt.status === 'creating' ? 'in-progress' : 'indeterminate' };
  }
  if (!identity(workspaceId) || !identity(prompt)) return { ...base, status: 'blocked', reason: 'invalid-input' };
  if (attempt.workspaceId && attempt.workspaceId !== workspaceId) return { ...base, status: 'blocked', reason: 'workspace-mismatch' };
  if (typeof record !== 'function' || typeof ctx?.sessions?.create !== 'function'
      || typeof ctx.sessions.retain !== 'function' || typeof ctx.sessions.binding !== 'function'
      || typeof ctx?.workspaces?.list?.getSnapshot !== 'function'
      || typeof ctx?.uiWorkspace?.openSession !== 'function' || typeof ctx?.layout?.selectPanel !== 'function') {
    return { ...base, status: 'blocked', reason: 'host-api-unavailable' };
  }

  let attempts = localAttempts.get(ctx.sessions);
  if (!attempts) { attempts = new Map(); localAttempts.set(ctx.sessions, attempts); }
  const previous = attempts.get(attemptId);
  if (previous) return previous.result ?? { ...base, status: 'in-progress', completion: previous.completion };
  const entry = {};
  attempts.set(attemptId, entry);

  const persist = async outcome => {
    const recoveryRecord = { attemptId, status: outcome.status,
      ...(outcome.sessionId ? { sessionId: outcome.sessionId } : {}),
      ...(outcome.reason ? { message: outcome.reason } : {}) };
    try {
      // Deliberately independent of signal, page selection, and current task.
      await record(recoveryRecord);
      return { ...base, ...outcome };
    } catch {
      return { ...base, ...outcome, status: 'record-failed', operationStatus: outcome.status, recoveryRecord };
    }
  };

  let createResult;
  try { createResult = ctx.sessions.create({ workspaceId, agentPreset: 'cordis' }); }
  catch (error) { createResult = Promise.reject(error); }
  const completion = Promise.resolve(createResult).then(sessionId =>
    identity(sessionId) ? { status: 'created', sessionId } : { status: 'indeterminate', reason: 'missing-session-id' },
  error => {
    const rpcError = error?.rpcError;
    const sessionId = identity(rpcError?.details?.sessionId);
    return rpcError?.code === 'session/workspace-attach-failed' && sessionId
      ? { status: 'attach-failed', sessionId }
      : { status: 'indeterminate', reason: 'create-outcome-unknown' };
  }).then(persist);
  entry.completion = completion;
  // The create completion remains reachable after the main function returns
  // on cancellation. Never discard a late real ID, including on record failure.
  completion.then(result => { if (entry.result?.status === 'cancelled') entry.result = result; });
  const finish = result => { entry.result = result; return result; };
  const created = await waitFor(completion, signal);
  if (created === stopped) return finish(cancelled({ completion }));
  if (created.status !== 'created') return finish(created);
  const sessionId = created.sessionId;
  if (!current()) return finish(cancelled({ sessionId, completion }));

  let reference;
  try {
    reference = ctx.sessions.retain(sessionId, { source: 'controllerOperation', ...(signal ? { signal } : {}) });
    const ready = await waitFor(reference.ready, signal);
    if (ready === stopped || !current()) return finish(cancelled({ sessionId, completion }));
    const binding = reference.binding;
    const exactBinding = () => binding?.sessionId === sessionId && ctx.sessions.binding(sessionId) === binding;
    const saveResult = async outcome => {
      const saving = persist({ sessionId, ...outcome });
      const saved = await waitFor(saving, signal);
      if (saved === stopped) return cancelled({ sessionId, operationStatus: outcome.status, completion: saving });
      return saved;
    };
    if (!exactBinding()) return finish(await saveResult({ status: 'blocked', reason: 'binding-changed' }));
    const preset = binding.session?.projections?.faceOf?.('agentPreset')?.getSnapshot?.();
    if (preset !== 'cordis') return finish(await saveResult({ status: 'blocked', reason: 'preset-mismatch' }));
    const workspaces = ctx.workspaces.list.getSnapshot();
    const workspace = workspaces?.items?.find(item => item.workspaceId === workspaceId);
    if (workspaces?.phase !== 'ready' || !Array.isArray(workspace?.sessionIds) || !workspace.sessionIds.includes(sessionId)) {
      return finish(await saveResult({ status: 'blocked', reason: workspaces?.phase === 'ready' ? 'workspace-mismatch' : 'workspace-unverified' }));
    }
    const input = binding.ctx?.get?.('conversation', false)?.input;
    if (typeof input?.requestDraftInitialization !== 'function') return finish(await saveResult({ status: 'blocked', reason: 'draft-unavailable' }));
    if (!current()) return finish(cancelled({ sessionId, completion }));
    if (!exactBinding()) return finish(await saveResult({ status: 'blocked', reason: 'binding-changed' }));
    const status = input.requestDraftInitialization(binding, { prompt, clearPreviousDraft: false });
    if (!['applied', 'preserved', 'blocked'].includes(status)) return finish(await saveResult({ status: 'blocked', reason: 'draft-status-unknown' }));
    const saved = await saveResult({ status });
    if (saved.status !== 'applied') return finish(saved);
    if (!current()) return finish(cancelled({ sessionId, operationStatus: status }));
    if (!exactBinding()) return finish({ ...saved, reason: 'binding-changed' });
    try {
      ctx.uiWorkspace.openSession(sessionId);
      if (!current()) return finish(cancelled({ sessionId, operationStatus: status }));
      ctx.layout.selectPanel(null);
    } catch { return finish({ ...saved, reason: 'navigation-failed' }); }
    return finish(saved);
  } catch {
    if (!current()) return finish(cancelled({ sessionId, completion }));
    return finish(await persist({ status: 'blocked', sessionId, reason: 'session-unavailable' }));
  } finally {
    // A disposed host generation must not turn a recoverable created session
    // back into a thrown error that loses its identity at the UI boundary.
    try { reference?.release(); } catch { /* host teardown already ended the reference */ }
  }
}
