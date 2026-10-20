import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreatorFeedbackDraft,renderCreatorFeedbackDraft} from '../src/creator-feedback.js';
const plugin={id:'git-alpha',name:'alpha',repository:'https://github.com/author/alpha?private=query',install:{version:'1.2.3',commit:'a'.repeat(40),spec:'https://secret:token@example.org/alpha#secret'},documentation:{text:'private documentation'}};
const task={id:'private-task',originalRequest:'客户公司原始需求 /Users/alice/private.txt',revisions:[{id:'private-revision',number:1,createdAt:'2026-10-20T12:00:00Z',workflow:{plan:{pluginIds:['git-alpha'],rationale:'敏感推荐理由'},candidates:[plugin]}}],feedback:[{revisionId:'private-revision',outcome:'blocked',note:'客户隐私失败说明'}],handoffs:[{sessionId:'private-session',workspaceId:'private-workspace'}]};
test('author draft only exports public version identities and task-level outcomes, not raw task/notes/IDs/specs',()=>{
 const draft=createCreatorFeedbackDraft({task},'git-alpha');const output=renderCreatorFeedbackDraft(draft);
 assert.equal(draft.plugin.name,'alpha');assert.equal(draft.observations[0].selected,true);assert.deepEqual(draft.observations[0].taskReportedOutcomes,['blocked']);
 for(const forbidden of ['客户','/Users/','private-task','private-revision','private-session','private-workspace','敏感推荐理由','private documentation','secret:token','private=query'])assert.ok(!output.includes(forbidden),forbidden);
 assert.ok(output.includes('尚未核对'));assert.ok(output.includes('任务自报'));assert.ok(output.includes('填写可分享'));
});
test('unselected candidates do not become adoption and missing feedback remains unknown',()=>{
 const draft=createCreatorFeedbackDraft({task:{...task,feedback:[],revisions:[{...task.revisions[0],workflow:{...task.revisions[0].workflow,plan:{pluginIds:[]}}}]}},'git-alpha');
 assert.equal(draft.observations[0].selected,false);assert.deepEqual(draft.observations[0].taskReportedOutcomes,[]);assert.ok(renderCreatorFeedbackDraft(draft).includes('候选，未被选中'));
});
test('draft rejects a plugin that is not in this task and never adds contact or shared state',()=>{
 assert.throws(()=>createCreatorFeedbackDraft({task},'invented'));const draft=createCreatorFeedbackDraft({task},'git-alpha');
 assert.equal(draft.shared,false);assert.equal(draft.installationState,'unknown');assert.equal(draft.runtimeState,'unknown');assert.equal(draft.firstUseState,'unknown');
});
test('sharing an older revision keeps that exact author identity across repository changes',()=>{
 const changed={...task,revisions:[...task.revisions,{...task.revisions[0],id:'new-revision',number:2,workflow:{plan:{pluginIds:['git-alpha']},candidates:[{...plugin,repository:'https://github.com/another/alpha'}]}}]};
 assert.equal(createCreatorFeedbackDraft({task:changed},'git-alpha',{revisionId:'private-revision'}).plugin.repository,'https://github.com/author/alpha');
 assert.equal(createCreatorFeedbackDraft({task:changed},'git-alpha',{revisionId:'new-revision'}).plugin.repository,'https://github.com/another/alpha');
 assert.throws(()=>createCreatorFeedbackDraft({task:changed},'git-alpha',{revisionId:'missing'}));
});
