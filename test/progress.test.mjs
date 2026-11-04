import test from 'node:test';
import assert from 'node:assert/strict';
import { beginProgress, currentProgressId, endProgress, progressSnapshot, recordProgress, resetProgress } from '../src/progress.js';

test.beforeEach(() => resetProgress());

test('开启一代进度后，第一条事件是阶段说明', () => {
  const id = beginProgress('查找来源并整理方案');
  const snapshot = progressSnapshot();
  assert.equal(snapshot.id, id);
  assert.equal(snapshot.running, true);
  assert.equal(snapshot.outcome, null);
  assert.deepEqual(snapshot.events.map(item => item.kind), ['phase']);
  assert.equal(snapshot.events[0].text, '查找来源并整理方案');
});

test('旧代进度记录的迟到事件不会写进新一代', () => {
  const first = beginProgress('第一代');
  recordProgress({ text: '第一代事件' }, first);
  const second = beginProgress('第二代');
  recordProgress({ text: '迟到的第一代事件' }, first);
  recordProgress({ text: '第二代事件' }, second);
  const texts = progressSnapshot().events.map(item => item.text);
  assert.deepEqual(texts, ['第二代', '第二代事件']);
});

test('取消收尾写入「已停止」，且之后不会被改写成「已完成」', () => {
  const id = beginProgress('查找来源');
  recordProgress({ text: 'Awesome DSH：读到 12 条' }, id);
  endProgress(id, 'stopped');
  endProgress(id, 'done');
  const snapshot = progressSnapshot();
  assert.equal(snapshot.running, false);
  assert.equal(snapshot.outcome, 'stopped');
  const terminals = snapshot.events.filter(item => ['done', 'stopped', 'failed'].includes(item.kind));
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].text, '已停止');
});

test('失败收尾写入「这一步失败了」', () => {
  const id = beginProgress('整理方案');
  endProgress(id, 'failed');
  const snapshot = progressSnapshot();
  assert.equal(snapshot.outcome, 'failed');
  assert.equal(snapshot.events.at(-1).kind, 'failed');
});

test('收尾之后不再接受新事件', () => {
  const id = beginProgress('查找来源');
  endProgress(id, 'done');
  recordProgress({ text: '收尾后的迟到事件' }, id);
  const texts = progressSnapshot().events.map(item => item.text);
  assert.equal(texts.includes('收尾后的迟到事件'), false);
});

test('事件上限保留最近 40 条', () => {
  const id = beginProgress('压力');
  for (let index = 0; index < 60; index += 1) recordProgress({ text: `事件${index}` }, id);
  const snapshot = progressSnapshot();
  assert.equal(snapshot.events.length, 40);
  assert.equal(snapshot.events.at(-1).text, '事件59');
});

test('未开启进度时快照为空且记录被忽略', () => {
  recordProgress({ text: '没有代' });
  const snapshot = progressSnapshot();
  assert.equal(snapshot.id, 0);
  assert.equal(snapshot.events.length, 0);
  assert.equal(currentProgressId(), 0);
});
