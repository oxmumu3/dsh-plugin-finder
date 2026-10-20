import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEligibility } from '../src/eligibility.js';

test('explicit refusal of additional model or service keys becomes a hard key filter', () => {
  for (const constraint of ['不要额外 API Key', '不再配置新的 API Key', '无需提供额外密钥', '不想申请第三方 API Key', 'No additional API keys', 'Must not require another API key']) {
    const result = extractEligibility([constraint]);
    assert.equal(result.requiresNoApiKey, true, constraint);
    assert.equal(result.nativeOnly, false);
    assert.ok(result.filters.some(filter => filter.key === 'requiresNoApiKey' && filter.constraints.includes(constraint)));
  }
});

test('explicit refusal to install plugins produces nativeOnly', () => {
  for (const constraint of ['不要安装新插件', '不能再添加插件', '不启用额外插件', '只用 DSH 原生能力', 'Do not install any plugins']) {
    const result = extractEligibility([constraint]);
    assert.equal(result.nativeOnly, true, constraint);
    assert.ok(result.filters.some(filter => filter.key === 'nativeOnly'));
  }
});

test('soft preferences and hypothetical constraints do not become hard filters', () => {
  for (const constraint of ['最好不用额外 API Key', '尽量不安装插件', '优先无需 API Key 的方案', '如果不用额外 API Key 就更好了', 'Prefer no extra API keys', '不一定需要安装新插件']) {
    const result = extractEligibility([constraint]);
    assert.equal(result.requiresNoApiKey, false, constraint);
    assert.equal(result.nativeOnly, false, constraint);
    assert.ok(result.unresolvedConstraints.includes(constraint));
  }
});

test('account refusal narrows key candidates but does not claim account-free verification', () => {
  const constraint = '不要注册新的第三方账号';
  const result = extractEligibility([constraint]);
  assert.equal(result.requiresNoApiKey, true);
  assert.ok(result.unresolvedConstraints.includes(constraint));
  assert.match(result.filters[0].note, /账号|账户/);
});

test('network, privacy and read-only requirements remain explicitly unresolved', () => {
  const constraints = ['全程不联网', '不上传本地文件', '只读检查，不修改任何源文件'];
  const result = extractEligibility(constraints);
  assert.equal(result.requiresNoApiKey, false);
  assert.equal(result.nativeOnly, false);
  assert.deepEqual(result.unresolvedConstraints, constraints);
});

test('mixed clauses retain the definite prohibition without turning preferences into hard checks', () => {
  const constraint = '不要额外 API Key，最好速度快一些';
  const result = extractEligibility([constraint]);
  assert.equal(result.requiresNoApiKey, true);
  assert.ok(result.unresolvedConstraints.includes(constraint));
});

test('instructions to protect or preserve a key are not refusal to use it', () => {
  for (const constraint of ['不要泄露 API Key', '不要删除已配置的 API Key', '不能把 API Key 写到日志里', '保留现有 API Key，不要展示给用户']) {
    const result = extractEligibility([constraint]);
    assert.equal(result.requiresNoApiKey, false, constraint);
    assert.ok(result.unresolvedConstraints.includes(constraint));
  }
});

test('empty inputs are safe and invalid shapes are rejected', () => {
  assert.deepEqual(extractEligibility([]), { requiresNoApiKey: false, nativeOnly: false, filters: [], unresolvedConstraints: [] });
  assert.throws(() => extractEligibility('no keys'), TypeError);
  assert.throws(() => extractEligibility([7]), TypeError);
});
