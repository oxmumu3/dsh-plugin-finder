import test from 'node:test';
import assert from 'node:assert/strict';
import { readExecutionConversation, watchExecutionConversation } from '../src/execution-conversation-view.js';

const event = (type, data, seq) => ({ type: 'event', event: { type, data, seq } });
const user = (text, rpcId) => ({ source: { kind: 'user', rpcId }, content: [{ type: 'text', text }] });
const assistant = text => ({ message: { content: [{ type: 'text', text }] }, turn: 1 });
const firstTurn = [event('turn/start', { turn: 1 }, 1), event('user/message', user('PRIVATE INTERNAL LONG PROMPT', 'first-request'), 2), event('assistant/message', assistant('First answer'), 3), event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 4)];
const read = (entries, session = {}) => readExecutionConversation({ entries, requestId: 'first-request', session });
function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of [...listeners]) fn(); }, get size() { return listeners.size; } };
}

test('only the matching internal request is hidden; later users and replies remain in order', () => {
  const snapshot = read([...firstTurn, event('turn/start', { turn: 2 }, 5), event('user/message', user('Make it shorter', 'follow-up'), 6), event('assistant/message', { ...assistant('Shorter answer'), turn: 2 }, 7), event('turn/end', { turn: 2, reason: { kind: 'completed' } }, 8)]);
  assert.deepEqual(snapshot.messages.map(row => [row.role, row.text]), [['assistant', 'First answer'], ['user', 'Make it shorter'], ['assistant', 'Shorter answer']]);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE INTERNAL/);
});

test('later running, queued and waiting turns never reuse the first completed status', () => {
  for (const session of [{ running: true }, { awaitingFirstTurn: true }]) {
    const snapshot = read(firstTurn, session);
    assert.equal(snapshot.active, true); assert.doesNotMatch(snapshot.summary, /完成|结束/);
  }
  const snapshot = read([...firstTurn, event('turn/start', { turn: 2 }, 5), event('user/message', user('Follow-up', 'follow-up'), 6)]);
  assert.equal(snapshot.phase, 'running'); assert.equal(snapshot.messages.at(-1).role, 'user');
  const queued = readExecutionConversation({ entries: firstTurn, requestId: 'first-request', inbox: { 'next-turn': [user('Queued', 'another')] } });
  assert.equal(queued.phase, 'waiting'); assert.doesNotMatch(queued.summary, /完成|结束/);
});

test('empty and unavailable states do not manufacture a result', () => {
  assert.deepEqual(read([]).messages, []); assert.doesNotMatch(read([]).summary, /完成|结束/);
  assert.equal(read(firstTurn, { openState: 'error' }).phase, 'unavailable');
});

test('the exact reference rebinds without mixing sessions and releases every subscription', async () => {
  const eventsA = observable({ entries: firstTurn }), eventsB = observable({ entries: [event('assistant/message', assistant('New binding answer'), 1)] });
  const sessionA = observable({ running: false }), sessionB = observable({ running: true });
  const inbox = observable({ 'next-turn': [], 'next-step': [] }), list = observable({}), status = observable(new Map());
  sessionA.projections = sessionB.projections = { faceOf: () => inbox };
  let binding = { sessionId: 'session-a', session: sessionA, eventSource: eventsA };
  const reference = { sessionId: 'session-a', get binding() { return binding; }, ready: Promise.resolve() };
  const sessions = { list, binding: () => binding };
  const seen = []; const stop = watchExecutionConversation({ reference, sessionId: 'session-a', requestId: 'first-request', sessions, sessionStatus: status }, value => seen.push(value));
  assert.deepEqual(seen.at(-1).messages.map(row => row.text), ['First answer']);
  binding = { sessionId: 'session-b', session: sessionB, eventSource: eventsB }; list.set({});
  assert.deepEqual(seen.at(-1).messages, []); assert.equal(eventsA.size, 0); assert.equal(eventsB.size, 0);
  binding = { sessionId: 'session-a', session: sessionB, eventSource: eventsB }; list.set({});
  assert.deepEqual(seen.at(-1).messages.map(row => row.text), ['New binding answer']); assert.equal(seen.at(-1).phase, 'running');
  stop(); const count = seen.length; eventsB.set({ entries: firstTurn }); await Promise.resolve();
  assert.equal(seen.length, count); assert.equal(eventsB.size + sessionB.size + list.size + inbox.size + status.size, 0);
});

test('transient tool output is summarized without duplicating a settled assistant reply', () => {
  const snapshot = read([...firstTurn.slice(0, 3), { type: 'transient', event: { type: 'assistant/live-chunk', data: { attemptId: 'live', turn: 1, step: 1, chunk: { text: 'First answer' } }, seq: 3.5 } }], { running: true });
  assert.deepEqual(snapshot.messages.map(row => row.text), ['First answer']); assert.equal(snapshot.active, true);
});
