import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { createPreviewController, PREVIEW_STORAGE_KEY, DEMO_REQUESTS } from './preview-controller.mjs';
import { featuredCatalog } from '../../../src/featured-catalog.js';
import { getCommunityOverview } from '../../../src/community-catalog.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function setup(seed) {
  const values = new Map(seed || []), reads = [], writes = [], jobs = new Map(); let index = 0;
  const storage = { getItem(key) { reads.push(key); return values.get(key) || null; }, setItem(key, value) { writes.push(key); values.set(key, value); } };
  const controller = createPreviewController({ storage, schedule(fn) { const id = ++index; jobs.set(id, fn); return id; }, unschedule(id) { jobs.delete(id); } });
  const one = () => { const [id, fn] = jobs.entries().next().value || []; if (fn) { jobs.delete(id); fn(); } };
  const flush = () => { for (let i = 0; jobs.size && i < 20; i += 1) one(); assert.equal(jobs.size, 0); };
  return { controller, state: controller.getSnapshot, values, reads, writes, jobs, one, flush, storage };
}
function searched(which = 'reading') { const env = setup(); env.controller.setHomeRequest(DEMO_REQUESTS[which]); env.controller.searchHome(); env.flush(); return env; }

test('supported input automatically reaches one result, and use completes inside the same task', () => {
  const env = setup();
  env.controller.setHomeRequest(DEMO_REQUESTS.reading);
  assert.equal(env.controller.searchHome(), true);
  assert.equal(env.state().busy, 'analyze');
  env.one(); assert.equal(env.state().busy, 'recommend');
  env.one(); assert.equal(env.state().view, 'find');
  assert.equal(env.state().plan.kind, 'native');
  const id = env.state().taskId;
  env.controller.runCurrentPlan(); assert.equal(env.state().execution.phase, 'preparing');
  env.one(); assert.equal(env.state().execution.phase, 'running');
  env.one(); assert.equal(env.state().execution.phase, 'completed');
  assert.equal(env.state().taskId, id);
  assert.equal(env.state().demoResults.length, 2);
  assert.match(env.state().execution.details, /合成结果.*没有读取真实文件/);
});

test('combo and gap presets stay distinct and an unknown input is not assigned a fabricated plan', () => {
  assert.equal(searched('projects').state().plan.kind, 'combo');
  assert.equal(searched('tool').state().plan.kind, 'gap');
  const env = setup(); env.controller.setHomeRequest('我想拍鱼缸纪录片');
  assert.equal(env.controller.searchHome(), false);
  assert.equal(env.state().plan, null); assert.equal(env.state().homeRequest, '我想拍鱼缸纪录片');
  assert.match(env.state().homeWarning, /尚未理解或生成/);
});

test('creation has one inline question, one-click answer and direct creation with the edited scope', () => {
  const env = searched('tool');
  env.controller.startCreation(); assert.equal(env.state().view, 'create'); env.flush();
  assert.equal(env.state().creation.questions.length, 1);
  assert.equal(env.controller.createInWorkspace(), false);
  env.controller.answerCreation('output', '保存在本机');
  assert.equal(env.state().creation.answers[0].answer, '保存在本机');
  env.controller.editCreation({ blueprint: { scope: '只记录三个示例字段' } });
  assert.equal(env.controller.createInWorkspace(), true); env.flush();
  assert.equal(env.state().creation.blueprint.scope, '只记录三个示例字段');
  assert.equal(env.state().execution.phase, 'completed');
  assert.match(env.state().execution.details, /没有生成文件、安装插件/);
});

test('cancelled work ignores late callbacks while retaining the request and original outcome', () => {
  const env = setup(); env.controller.setHomeRequest(DEMO_REQUESTS.reading); env.controller.searchHome();
  const lateSearch = [...env.jobs.values()][0]; env.controller.cancel(); lateSearch();
  assert.equal(env.state().searching, false); assert.equal(env.state().plan, null);
  assert.equal(env.state().homeRequest, DEMO_REQUESTS.reading);
  env.controller.searchHome(); env.flush(); const title = env.state().plan.title;
  env.controller.runCurrentPlan(); const lateExecution = [...env.jobs.values()][0]; env.controller.cancelExecution(); lateExecution();
  assert.equal(env.state().execution.phase, 'cancelled'); assert.equal(env.state().plan.title, title); assert.equal(env.jobs.size, 0);
});

test('source failure is recoverable and execution failure preserves a direct retry', () => {
  const env = setup(); env.controller.setDemoFailure('source'); env.controller.setHomeRequest(DEMO_REQUESTS.tool); env.controller.searchHome(); env.flush();
  assert.equal(env.state().discovery.sources[0].status, 'failed');
  env.controller.recommend(); env.flush(); assert.equal(env.state().discovery.sources[0].status, 'live');
  env.controller.setDemoFailure('execution'); env.controller.runCurrentPlan(); env.flush();
  assert.equal(env.state().execution.phase, 'failed');
  env.controller.runCurrentPlan(); env.flush(); assert.equal(env.state().execution.phase, 'completed');
});

test('bounded followups revise the same task and unsupported or negative statements only preserve the text', () => {
  const env = searched(); const id = env.state().taskId;
  env.controller.setFollowup('原文只读'); env.controller.submitFollowup();
  assert.equal(env.state().taskId, id); assert.equal(env.state().revisionNumber, 2);
  assert.ok(env.state().plan.limits.includes('原文只读，只更新独立记录。'));
  env.controller.setFollowup('首版只做阅读状态'); env.controller.submitFollowup();
  assert.equal(env.state().revisionNumber, 3);
  const plan = JSON.stringify(env.state().plan);
  env.controller.setFollowup('我不想只做阅读状态'); env.controller.submitFollowup();
  assert.equal(JSON.stringify(env.state().plan), plan); assert.equal(env.state().revisionNumber, 3);
  assert.match(env.state().notice, /当前方案未被修改/);
  assert.equal(env.state().conversation.at(-1).text, '我不想只做阅读状态');
});

test('featured suggestion starts immediately and both replaced input and task history can be restored', () => {
  const env = searched(); const originalId = env.state().taskId;
  env.controller.showHome(); env.controller.setHomeRequest('保留这句未提交的输入');
  assert.equal(env.controller.startFeatured('family-assistant'), true);
  assert.equal(env.state().searching, true); env.flush();
  assert.equal(env.state().request, featuredCatalog.find(entry => entry.id === 'family-assistant').scenario);
  assert.equal(env.state().featuredDrafts[0].request, '保留这句未提交的输入');
  assert.equal(env.state().demoHistory[0].taskId, originalId);
  env.controller.restoreHistory(originalId); assert.equal(env.state().request, DEMO_REQUESTS.reading);
  env.controller.restoreFeaturedDraft(env.state().featuredDrafts[0].id); assert.equal(env.state().homeRequest, '保留这句未提交的输入');
});

test('real community entries stay readable offline and cannot produce a fabricated recommendation', () => {
  const env = searched(); const taskId = env.state().taskId, plan = JSON.stringify(env.state().plan);
  const entry = getCommunityOverview().categories[0].previews[0];
  env.controller.showHome(); env.controller.setHomeRequest('真实目录之前的原输入');
  assert.equal(env.controller.startCommunityPlugin(entry.id), false);
  assert.equal(env.state().taskId, taskId); assert.equal(JSON.stringify(env.state().plan), plan);
  assert.equal(env.jobs.size, 0); assert.equal(env.state().homeRequest, '真实目录之前的原输入'); assert.equal(env.state().homeCommunityEntryId, entry.id);
  assert.match(env.state().homeWarning, /需要回到 Harness 调用模型.*尚未推荐、安装或运行/);
  assert.ok(env.state().featuredDrafts.some(draft => draft.request === '真实目录之前的原输入'));
  assert.ok(env.state().demoHistory.some(task => task.taskId === taskId));
  assert.equal(env.controller.startCommunityPlugin('unknown'), false);
  const selectedRequest = env.state().homeRequest;
  env.controller.restoreHistory(taskId);
  const saved = env.state().featuredDrafts.find(draft => draft.request === selectedRequest && draft.communityEntryId === entry.id);
  assert.ok(saved, 'restoring history must retain the pending community request');
  assert.equal(env.state().homeCommunityEntryId, null);
  env.controller.restoreFeaturedDraft(saved.id); assert.equal(env.state().homeRequest, selectedRequest); assert.equal(env.state().homeCommunityEntryId, entry.id);
});

test('offline community selection uses its default request only when the home input is blank', () => {
  for (const input of ['', ' \t\n ']) {
    const env = setup(), entry = getCommunityOverview().categories[0].previews[0];
    env.controller.setHomeRequest(input); env.controller.startCommunityPlugin(entry.id);
    assert.equal(env.state().homeRequest, '我想了解并使用刚选中的插件：它能帮我完成什么、需要哪些配置，以及怎样在当前工作区开始使用。');
    assert.equal(env.state().homeCommunityEntryId, entry.id); assert.equal(env.jobs.size, 0);
  }
});

test('offline directory drafts retain distinct plugins with identical text and restore the exact selected identity', () => {
  const env = searched(); const [first, second] = getCommunityOverview().categories[0].previews;
  env.controller.startCommunityPlugin(first.id); const request = env.state().homeRequest;
  env.controller.startCommunityPlugin(second.id);
  assert.equal(env.state().homeRequest, request); assert.equal(env.state().homeCommunityEntryId, second.id);
  const saved = env.state().featuredDrafts.find(draft => draft.communityEntryId === first.id);
  assert.ok(saved); env.controller.restoreFeaturedDraft(saved.id);
  assert.equal(env.state().homeCommunityEntryId, first.id);
  env.controller.startCommunityPlugin(second.id);
  for (const entry of [first, second]) assert.equal(env.state().featuredDrafts.filter(draft => draft.request === request && draft.communityEntryId === entry.id).length, 1);
  env.controller.setHomeRequest('只处理本地资料'); assert.equal(env.state().homeCommunityEntryId, second.id);
  env.controller.setHomeRequest(DEMO_REQUESTS.tool); assert.equal(env.controller.searchHome(), false); assert.equal(env.jobs.size, 0);
  assert.match(env.state().homeWarning, /需要回到 Harness 调用模型/);
  env.controller.clearHomeCommunitySelection(); assert.equal(env.state().homeCommunityEntryId, null); assert.equal(env.state().homeRequest, DEMO_REQUESTS.tool);
  env.controller.startCommunityPlugin(second.id); env.controller.prepareHomeExample(DEMO_REQUESTS.reading); assert.equal(env.state().homeCommunityEntryId, null);
});

test('only the new demo storage key is read or written and a reload cannot imply a running background task', () => {
  const legacyKey = 'finder-experience-v2'; const env = setup([[legacyKey, 'OLD VALUE MUST STAY']]);
  env.controller.setHomeRequest(DEMO_REQUESTS.reading); env.controller.searchHome(); env.flush(); env.controller.runCurrentPlan();
  const reopened = createPreviewController({ storage: env.storage });
  assert.equal(reopened.getSnapshot().execution.phase, 'cancelled');
  assert.equal(env.values.get(legacyKey), 'OLD VALUE MUST STAY');
  assert.ok(env.reads.every(key => key === PREVIEW_STORAGE_KEY));
  assert.ok(env.writes.every(key => key === PREVIEW_STORAGE_KEY));
});

test('rejected originals remain byte-identical to the archive receipt', async () => {
  const folder = path.join(root, 'docs/design/history/experience-v2-rejected-20261023');
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'archive.json'), 'utf8'));
  for (const file of manifest.files) { const data = await fs.readFile(path.join(folder, file.file)); assert.equal(data.length, file.bytes); assert.equal(sha(data), file.sha256); }
  assert.equal(manifest.files.find(file => file.file === 'index.html').sha256, '74043906f680573603f26811cf0b1232551c7b3daf7efcdfeadf7030d1927947');
});

test('self-contained output shares the recorded production sources and blocks network requests', async () => {
  const dir = path.join(root, 'docs/design/experience-v2');
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
  const receipt = JSON.parse(await fs.readFile(path.join(dir, 'build-receipt.json'), 'utf8'));
  assert.equal(sha(html), receipt.sha256); assert.equal(Buffer.byteLength(html), receipt.bytes);
  assert.ok(receipt.sharedProductionComponents.includes('src/experience-view.js'));
  for (const source of receipt.sourceHashes) assert.equal(sha(await fs.readFile(path.join(root, source.file))), source.sha256, source.file);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)]; assert.equal(scripts.length, 1);
  new Script(scripts[0][1]);
  assert.equal(createHash('sha256').update(scripts[0][1]).digest('base64'), receipt.inlineScriptSha256);
  assert.ok(html.includes(`script-src 'sha256-${receipt.inlineScriptSha256}'`));
  assert.match(html, /connect-src 'none'/); assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|piggy00544|P00544/u);
  assert.match(html, /current-workspace-demo\.v1/);
  const source = await fs.readFile(path.join(dir, 'preview-controller.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage\.clear|removeItem\s*\(/u);
});
