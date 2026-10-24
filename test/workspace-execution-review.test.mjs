import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderController} from '../src/client.js';
import {createExperienceView} from '../src/experience-view.js';

const intent={goal:'读取示例',input:'demo.md',output:'摘要',constraints:['原文只读'],capabilities:['读取'],queries:['read']};
const plan={kind:'native',title:'读取当前资料',rationale:'使用现成读取能力',pluginIds:[],steps:[{capability:'读取',owner:'dsh',sourceCapability:null,action:'读取后总结',input:'demo.md',output:'摘要'}],limits:[]};
const attempt={attemptId:'a1',requestId:'q1',taskId:'t1',revisionId:'r1',workspaceId:'saved-workspace',kind:'use',status:'submitted',sessionId:'saved-session',provenance:'local',prompt:'保存的原始执行指令'};
const workflow={taskId:'t1',revisionId:'r1',revisionNumber:1,stage:'plan',request:'只读demo.md',intent,plan,candidates:[],revisions:[],executions:[attempt]};
function setup({currentSession=null,additionalWorkflow=null}={}){
  const requests=[],executions=[],workspaceListeners=new Set();
  const ctx={workspaces:{list:{getSnapshot:()=>({phase:'ready',items:[{workspaceId:'saved-workspace',title:'原执行项目',sessionIds:['saved-session']},{workspaceId:'other-workspace',title:'另一个项目',sessionIds:['other-session']}]}),subscribe:listener=>{workspaceListeners.add(listener);return()=>workspaceListeners.delete(listener);}}},sessions:{list:{getSnapshot:()=>({phase:'ready',ids:currentSession?[currentSession]:[],byId:currentSession?{[currentSession]:{id:currentSession,retainedBy:{mainView:1}}}:{}}),subscribe:()=>()=>{}}},uiSession:{sessionStatus:{getSnapshot:()=>new Map()}}};
  const controller=createFinderController(ctx,{draftStorage:{getItem:()=>null,setItem(){},removeItem(){}},waitForExecutionUI:async()=>{},executeInWorkspace:async(_ctx,options)=>{executions.push(options);options.onStatus({phase:'completed',terminal:true,summary:'原执行已结束',result:'原结果',sessionId:'saved-session'});return{dispose(){},completion:Promise.resolve()};},fetch:async(url,options)=>{const path=url.split('/').at(-1);requests.push(path);assert.ok(['bootstrap','open'].includes(path),'restoration must never claim or submit again');const body=options.body?JSON.parse(options.body):null;const opened=additionalWorkflow&&body?.taskId===additionalWorkflow.taskId&&body?.revisionId===additionalWorkflow.revisionId?additionalWorkflow:workflow;return{ok:true,json:async()=>path==='bootstrap'?{model:{configured:true},hostVersion:'0.2.1-rc.2',workflow}:{workflow:opened}};}});
  return{controller,requests,executions,notifyWorkspaceChange:()=>{for(const listener of workspaceListeners)listener();}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

test('saved execution resumes its exact workspace even with no current workspace selection',async()=>{
  const {controller,requests,executions}=setup();
  try{
    await controller.bootstrap();controller.showFind();await settle();
    assert.equal(executions.length,1,'a known saved workspace must not require choosing a current one');
    assert.equal(executions[0].acquired,false);assert.equal(executions[0].attempt.workspaceId,'saved-workspace');
    assert.deepEqual(requests,['bootstrap']);
  }finally{controller.close();}
});

test('opening saved history reconnects read-only and labels the actual execution workspace',async()=>{
  const {controller,requests,executions,notifyWorkspaceChange}=setup({currentSession:'other-session'});
  try{
    await controller.bootstrap();await controller.openTask('t1','r1');await settle();
    assert.equal(executions.length,1);assert.equal(executions[0].acquired,false);assert.equal(executions[0].attempt.workspaceId,'saved-workspace');
    assert.equal(controller.getSnapshot().executionWorkspaceLabel,'原执行项目');
    notifyWorkspaceChange();assert.equal(controller.getSnapshot().executionWorkspaceLabel,'原执行项目','workspace list updates must not relabel an already associated execution');
    assert.equal(controller.getSnapshot().workspaceId,'other-workspace','current main workspace inference remains independent of execution label');
    assert.deepEqual(requests,['bootstrap','open']);
  }finally{controller.close();}
});

test('opening a different revision releases the old execution label without changing current workspace inference',async()=>{
  const next={...workflow,revisionId:'r2',revisionNumber:2,executions:[]};
  const {controller,executions,notifyWorkspaceChange}=setup({currentSession:'other-session',additionalWorkflow:next});
  try{
    await controller.bootstrap();controller.showFind();await settle();
    assert.equal(controller.getSnapshot().executionWorkspaceLabel,'原执行项目');
    await controller.openTask(next.taskId,next.revisionId);await settle();notifyWorkspaceChange();
    assert.equal(controller.getSnapshot().execution,null);assert.equal(controller.getSnapshot().executionWorkspaceLabel,'另一个项目');
    assert.equal(controller.getSnapshot().workspaceId,'other-workspace');assert.equal(executions.length,1);
  }finally{controller.close();}
});

test('a completed model turn retains the create alternative when the existing solution is insufficient',()=>{
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useRef:()=>({current:null}),Fragment:'fragment'};
  const View=createExperienceView(React),tree=View({state:{...workflow,view:'find',bootstrapLoaded:true,bootstrap:{model:{configured:true}},execution:{phase:'completed',kind:'use',summary:'本次运行已结束',result:'当前现成能力无法满足这个需求。'},creation:null,executionWorkspaceLabel:'原执行项目'},controller:{},modelReady:true});
  const nodes=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(node&&typeof node==='object'){nodes.push(node);walk(node.children);}};walk(tree);
  assert.ok(nodes.some(node=>node.type==='button'&&node.children.includes('创建自己的插件')&&!node.props.disabled),'an ended turn is not proof the user goal was satisfied');
  assert.ok(!nodes.some(node=>node.type==='button'&&node.children.includes('使用这个方案')),'completed existing execution is not resent');
});
