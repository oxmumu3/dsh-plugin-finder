import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deriveAgentCaller, registerAgentTools} from '../src/agent-tools.js';
import {withOwnedDomain} from '../src/lifecycle.js';

async function fixture(t, overrides={}) {
  const directory=await realpath(await mkdtemp(join(tmpdir(),'finder-agent-tools-')));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const definitions=new Map(), effects=[], calls=[], approvals=[], mutations=[],approvalDecision={run:async()=>{}};
  const agent={id:'session-owner',session:{id:'session-owner',header:{cwd:directory}}};
  const workspace={id:'workspace-owner',path:directory,sessionIds:[agent.id]};
  let cwd=directory;
  const ctx={
    effect(fn){effects.push(fn());},
    tools:{register(definition){definitions.set(definition.name,definition);return()=>definitions.delete(definition.name);},
      get(name,scope){return scope===agent?definitions.get(name):undefined;},
      schemas(scope){assert.equal(scope,agent);return[{name:'finder_lookup'},{name:'new_real_tool'}];}},
    systemPrompt:{section(value){ctx.section=value;return()=>{delete ctx.section;};}},
    workspaceRegistry:{list:()=>[workspace],resolveByPath:async path=>path===directory?workspace:undefined},
    workingDirectory:{get:()=>cwd},sandboxPolicy:{resolve:({session})=>{assert.equal(session,agent.session);return{mode:'workspace-write'};}},
    get(name){return name==='approval'?{kind:'real-approval-service'}:undefined;},
    ...overrides,
  };
  const service={
    async find(args,caller,options){calls.push({method:'find',args,caller,options});return{requestId:'request-1',status:'planned'};},
    async activate(args,caller,options){calls.push({method:'activate',args,caller,options});assert.equal(await options.authorize({profileImpact:'all sessions'}),true);mutations.push(args.requestId);return{requestId:args.requestId,status:'ready'};},
    async status(args,caller){calls.push({method:'status',args,caller});return{requestId:args.requestId,status:'planned'};},
  };
  const cleanup=registerAgentTools(ctx,service,{defineTool:x=>x,approveEscalation:async(request,approval)=>{approvals.push({request,approval});await approvalDecision.run();}});
  const exec={agent,callId:'call-1',rootCallId:'call-root',signal:new AbortController().signal};
  return{directory,workspace,agent,ctx,service,definitions,calls,approvals,mutations,approvalDecision,exec,cleanup,effects,setCwd:value=>{cwd=value;}};
}

test('tools bind caller to runtime agent and scoped visible capability list',async t=>{
  const f=await fixture(t);
  assert.deepEqual([...f.definitions.keys()],['finder_lookup','finder_activate','finder_create','finder_status']);
  const input={goal:'产生可核对成果',acceptance:'文件可打开',constraints:['只用工作区'],knownCapabilities:['已有读取工具']};
  assert.equal(JSON.parse(await f.definitions.get('finder_lookup').execute(input,f.exec)).status,'planned');
  assert.deepEqual(f.calls[0].caller,{sessionId:f.agent.id,workspaceId:f.workspace.id,directory:f.directory});
  assert.equal(f.calls[0].options.callId,'call-1');
  assert.equal(f.calls[0].options.signal.aborted,false);
  const result=JSON.parse(await f.definitions.get('finder_activate').execute({requestId:'request-1'},f.exec));
  assert.deepEqual(result.availableTools,['finder_lookup','new_real_tool']);
  assert.equal(f.approvals.length,1);
  assert.equal(f.approvals[0].request.requestedMode,'danger-full-access');
  assert.match(f.approvals[0].request.justification,/profile|工作区|所有会话/u);
  assert.equal(f.approvals[0].approval.agent,f.agent);
  assert.equal(f.approvals[0].approval.callId,f.exec.callId);
  assert.equal(f.approvals[0].approval.toolName,'finder_activate');
  assert.equal(f.approvals[0].approval.approver.kind,'real-approval-service');
});

test('no model arguments can forge caller, workspace, installation spec or approval',async t=>{
  const f=await fixture(t);
  for(const [name,args] of [
    ['finder_lookup',{goal:'a',acceptance:'b',sessionId:'other'}],
    ['finder_activate',{requestId:'request-1',approved:true}],
    ['finder_activate',{requestId:'request-1',workspaceId:'other'}],
    ['finder_create',{requestId:'request-1',source:'/outside'}],
    ['finder_create',{requestId:'request-1',promptHash:'a'.repeat(64)}],
    ['finder_create',{requestId:'request-1',expectedContentHash:'a'.repeat(64)}],
    ['finder_create',{requestId:'request-1',expectedRevisionId:'forged'}],
    ['finder_status',{requestId:'request-1',caller:'other'}],
  ])await assert.rejects(f.definitions.get(name).execute(args,f.exec),error=>error.code==='INVALID_INPUT');
  assert.equal(f.calls.length,0);assert.equal(f.approvals.length,0);
});

test('missing runtime session, mismatched current cwd and ambiguous membership fail closed',async t=>{
  const f=await fixture(t);
  await assert.rejects(deriveAgentCaller(f.ctx,{...f.exec,agent:undefined}),error=>error.code==='AGENT_CALLER_INVALID');
  f.setCwd(tmpdir());
  await assert.rejects(deriveAgentCaller(f.ctx,f.exec),error=>error.code==='AGENT_CALLER_INVALID');
  f.setCwd(f.directory);f.ctx.workspaceRegistry.list=()=>[f.workspace,{...f.workspace,id:'second'}];
  await assert.rejects(deriveAgentCaller(f.ctx,f.exec),error=>error.code==='AGENT_CALLER_INVALID');
  assert.equal(f.calls.length,0);
});

test('unattached runtime session may bind only to its canonical registered current cwd',async t=>{
  const f=await fixture(t);f.workspace.sessionIds=[];
  assert.equal((await deriveAgentCaller(f.ctx,f.exec)).workspaceId,f.workspace.id);
  f.ctx.workspaceRegistry.resolveByPath=async()=>undefined;
  await assert.rejects(deriveAgentCaller(f.ctx,f.exec),error=>error.code==='AGENT_CALLER_INVALID');
});

test('changing to a normal workspace subdirectory preserves the stable root binding',async t=>{
  const f=await fixture(t),nested=join(f.directory,'src');await mkdir(nested);f.setCwd(nested);
  assert.deepEqual(await deriveAgentCaller(f.ctx,f.exec),{sessionId:f.agent.id,workspaceId:f.workspace.id,directory:f.directory});
  await f.definitions.get('finder_lookup').execute({goal:'a',acceptance:'b'},f.exec);
  assert.equal(f.calls[0].caller.directory,f.directory);
});

test('a workspace symlink to an external directory does not extend Finder caller scope',async t=>{
  const f=await fixture(t),outside=await realpath(await mkdtemp(join(tmpdir(),'finder-outside-')));t.after(()=>rm(outside,{recursive:true,force:true}));
  const alias=join(f.directory,'external');await symlink(outside,alias);f.setCwd(alias);
  await assert.rejects(deriveAgentCaller(f.ctx,f.exec),error=>error.code==='AGENT_CALLER_INVALID');
});

test('routing is scoped, outcome focused and explicitly avoids unnecessary discovery',async t=>{
  const f=await fixture(t);
  assert.equal(f.ctx.section.text({scope:{id:'other'}}),'');
  const text=f.ctx.section.text({scope:f.agent});
  assert.match(text,/finder_lookup/);assert.match(text,/缺材料|材料不足/u);assert.match(text,/原任务/u);assert.match(text,/原生|已有/u);
  f.cleanup();f.cleanup();assert.equal(f.definitions.size,0);assert.equal(f.ctx.section,undefined);
});

test('integrated Harness features route through supply discovery before building from scratch',async t=>{
  const f=await fixture(t),routing=f.ctx.section.text({scope:f.agent}),lookup=f.definitions.get('finder_lookup').description;
  for(const text of [routing,lookup]){
    assert.match(text,/Harness/u);assert.match(text,/持久面板/u);assert.match(text,/额外工具/u);assert.match(text,/工作流/u);
    assert.match(text,/先.{0,20}finder_lookup/u);
    assert.match(text,/从零.{0,20}不等于.{0,20}集成/u);
  }
  assert.match(routing,/已有代码开发|现有代码开发/u);
  assert.match(routing,/纯读写|读写计算/u);
  assert.match(routing,/直接完成/u);
});

test('returned nextTool keeps activation and original-task completion in the managed flow',async t=>{
  const f=await fixture(t),routing=f.ctx.section.text({scope:f.agent});
  assert.match(routing,/nextTool\.name/u);assert.match(routing,/nextTool\.arguments/u);
  assert.match(routing,/finder_activate/u);assert.match(routing,/原任务/u);assert.match(routing,/实际.{0,10}验收|实际使用.{0,10}验证/u);
  assert.match(routing,/不得.{0,80}profile.{0,80}凭据/u);
  assert.match(routing,/CLI/u);assert.match(routing,/手工.{0,10}profile/u);
  assert.match(f.definitions.get('finder_activate').description,/nextTool/u);
  assert.match(f.definitions.get('finder_create').description,/先.{0,20}finder_lookup/u);
});

test('missing sandbox policy prevents activation before asking or installing',async t=>{
  const f=await fixture(t);
  f.ctx.sandboxPolicy.resolve=()=>{throw new Error('blocked');};
  await assert.rejects(f.definitions.get('finder_activate').execute({requestId:'request-1'},f.exec));
  assert.equal(f.approvals.length,0);
  assert.equal(f.mutations.length,0);
});

test('official approval denial does not start plugin mutation',async t=>{
  const f=await fixture(t);f.approvalDecision.run=async()=>{throw new Error('approval rejected');};
  await assert.rejects(f.definitions.get('finder_activate').execute({requestId:'request-1'},f.exec),/approval rejected/);
  assert.equal(f.approvals.length,1);assert.equal(f.mutations.length,0);
});

test('changing current cwd while approval is pending prevents installation',async t=>{
  const f=await fixture(t);f.approvalDecision.run=async()=>{f.setCwd(tmpdir());};
  await assert.rejects(f.definitions.get('finder_activate').execute({requestId:'request-1'},f.exec),error=>error.code==='AGENT_CALLER_INVALID');
  assert.equal(f.approvals.length,1);assert.equal(f.mutations.length,0);
});

test('aborted invocation or disposed registrations never call the service',async t=>{
  const f=await fixture(t),lookup=f.definitions.get('finder_lookup'),abort=new AbortController();abort.abort();
  await assert.rejects(lookup.execute({goal:'a',acceptance:'b'},{...f.exec,signal:abort.signal}));
  f.cleanup();await assert.rejects(lookup.execute({goal:'a',acceptance:'b'},f.exec),error=>error.code==='AGENT_CALLER_INVALID');
  assert.equal(f.calls.length,0);
});

test('registration errors remove earlier registered tools',async t=>{
  const f=await fixture(t);f.cleanup();
  const register=f.ctx.tools.register;
  f.ctx.tools.register=value=>{if(value.name==='finder_create')throw new Error('registration failed');return register(value);};
  assert.throws(()=>registerAgentTools(f.ctx,f.service,{defineTool:x=>x,approveEscalation:async()=>{}}),/registration failed/);
  assert.equal(f.definitions.size,0);
});

test('oversized or malformed model inputs fail before calling core',async t=>{
  const f=await fixture(t);
  for(const args of [{goal:'',acceptance:'x'},{goal:'x',acceptance:'x',constraints:Array(25).fill('a')},{goal:'x',acceptance:'x',knownCapabilities:[3]}]){
    await assert.rejects(f.definitions.get('finder_lookup').execute(args,f.exec),error=>error.code==='INVALID_INPUT');
  }
  assert.equal(f.calls.length,0);
});

test('finder_create forwards bounded repair feedback to the owned request without spawning an active or unknown attempt',async t=>{
  const f=await fixture(t),prepared=[];
  f.ctx.tools.guard=()=>()=>{};
  f.ctx.subagents={resolveMaxDepth:()=>1,startActivation:async()=>assert.fail('unknown attempt must not respawn')};
  f.service.prepareCreation=async(args,caller)=>{prepared.push({args,caller});return{requestId:args.requestId,status:'creation_unknown'};};
  const definition=f.definitions.get('finder_create'),feedback='已核安装失败：注册 RPC 需要显式 inject webServer。\n保留原目标和旧源码，不覆盖旧目录。';
  assert.equal(definition.parameters.feedback?.type,'string');
  assert.match(definition.parameters.feedback.description,/未安装[^。]*审查/u);
  assert.match(definition.description,/调用方[^。]*审查/u);
  assert.match(f.ctx.section.text({scope:f.agent}),/审批拒绝[^。]*不[^。]*代码失败/u);
  const value=JSON.parse(await definition.execute({requestId:'request-1',feedback,answers:[{id:'layout',answer:'沿用原布局'}]},f.exec));
  assert.equal(value.status,'creation_unknown');assert.equal(prepared.length,1);
  assert.deepEqual(prepared[0].args,{requestId:'request-1',feedback,answers:[{id:'layout',answer:'沿用原布局'}]});
  assert.equal(prepared[0].caller.sessionId,f.agent.id);
  for(const invalid of ['',123,'x'.repeat(3001)])await assert.rejects(definition.execute({requestId:'request-1',feedback:invalid},f.exec),error=>error.code==='INVALID_INPUT');
  assert.equal(prepared.length,1);
  await assert.rejects(f.definitions.get('finder_status').execute({requestId:'request-1',feedback},f.exec),error=>error.code==='INVALID_INPUT');
});

test('finder_create rejects four answers with an original-request recovery and forwards at most three',async t=>{
  const f=await fixture(t),prepared=[];
  f.ctx.tools.guard=()=>()=>{};
  f.ctx.subagents={resolveMaxDepth:()=>1,startActivation:async()=>assert.fail('an unknown attempt must not respawn')};
  f.service.prepareCreation=async(args,caller)=>{prepared.push({args,caller});return{requestId:args.requestId,status:'creation_unknown'};};
  const definition=f.definitions.get('finder_create'),answers=['layout','storage','scope','invented'].map(id=>({id,answer:'沿用原需求'}));
  for(const text of [definition.description,f.ctx.section.text({scope:f.agent})]){
    assert.match(text,/首次[^。]*只[^。]*requestId/u);assert.match(text,/creation\.questions/u);assert.match(text,/不[^。]*发明[^。]*id/u);
  }
  await assert.rejects(definition.execute({requestId:'request-1',answers},f.exec),cause=>{
    assert.equal(cause.code,'AGENT_CREATION_ANSWERS_INVALID');assert.equal(cause.requestId,'request-1');
    assert.deepEqual(cause.nextTool,{name:'finder_status',arguments:{requestId:'request-1'}});
    assert.match(cause.message,/最多3/u);assert.match(cause.message,/creation\.questions/u);assert.doesNotMatch(cause.message,/目标和可检查的验收/u);return true;
  });
  assert.equal(prepared.length,0);assert.equal(f.calls.length,0);assert.equal(f.approvals.length,0);
  const value=JSON.parse(await definition.execute({requestId:'request-1',answers:answers.slice(0,3)},f.exec));
  assert.equal(value.requestId,'request-1');assert.deepEqual(prepared[0].args,{requestId:'request-1',answers:answers.slice(0,3)});assert.equal(prepared.length,1);
});

test('plugin shutdown awaits exact Creator disposal and its durable settlement before closing storage',async t=>{
  const f=await fixture(t),events=[];
  f.agent.options={};f.agent.session.header.delegationDepth=0;
  let storageClosed=false,releaseDispose,settleResult,started;
  const published=new Promise(resolve=>{started=resolve;});
  const disposeGate=new Promise(resolve=>{releaseDispose=resolve;});
  f.ctx.tools.guard=()=>()=>{events.push('guard-removed');};
  f.ctx.subagents={resolveMaxDepth:()=>1,async startActivation(){
    started();return{childId:'creator-child',result:new Promise(resolve=>{settleResult=resolve;}),async dispose(){events.push('dispose-start');await disposeGate;events.push('dispose-end');settleResult({stopReason:'aborted'});}};
  }};
  const snapshot={requestId:'request-1',revisionId:'revision-ready',status:'creation_ready',intent:{goal:'本地插件',constraints:['只在当前工作区']},creation:{status:'ready',contentHash:'a'.repeat(64),supply:{status:'current'},blueprint:{purpose:'本地交互能力'}}};
  f.service.prepareCreation=async()=>structuredClone(snapshot);
  f.service.claimCreation=async()=>({...structuredClone(snapshot),claim:'acquired',childId:'creator-child'});
  f.service.recordCreation=async record=>{assert.equal(storageClosed,false,'Creator settlement must retain its owned storage');events.push('record:'+record.status);return{...structuredClone(snapshot),creation:{...snapshot.creation,runStatus:record.status}};};
  f.ctx.storageDomain={open:async()=>({close:async()=>{storageClosed=true;events.push('storage-closed');}})};
  await withOwnedDomain(f.ctx,{name:'agent-requests'},async()=>async()=>{await f.cleanup();});
  const lookup=f.definitions.get('finder_lookup'),pending=f.definitions.get('finder_create').execute({requestId:'request-1'},f.exec);
  await published;
  const shutdown=f.effects.at(-1)();
  await new Promise(resolve=>setImmediate(resolve));
  try{
    assert.ok(events.includes('dispose-start'),'cleanup must cancel an already published activation');
    assert.equal(storageClosed,false,'storage must stay open until the exact activation settles');
    await assert.rejects(lookup.execute({goal:'new',acceptance:'no work after close'},f.exec),error=>error.code==='AGENT_CALLER_INVALID');
  }finally{releaseDispose();}
  const result=JSON.parse(await pending);await shutdown;
  assert.equal(result.creation.runStatus,'unknown');assert.equal(storageClosed,true);
  assert.ok(events.indexOf('record:unknown')<events.indexOf('storage-closed'));
  assert.ok(events.indexOf('dispose-end')<events.indexOf('guard-removed'));
});
