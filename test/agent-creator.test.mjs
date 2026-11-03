import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runAgentCreation,buildCreatorPrompt,observeAgentCreation} from '../src/agent-creator.js';
import {createFinderService} from '../src/service.js';
import {createAgentFinderService} from '../src/agent-finder-service.js';

const caller={sessionId:'parent-session',workspaceId:'workspace-a',directory:'/safe/workspace'};
const creation={status:'ready',supply:{status:'current'},blueprint:{name:'本地工具',purpose:'解决真实缺口',acceptance:'输出可核对'},questions:[],answers:[],draft:{constraints:['不得外传']}};
function fixture({claim='acquired',startError,result,failRecord=false,signal}={}) {
  const records=[], starts=[], guards=[],claims=[];
  const snapshot={requestId:'request-a',revisionId:'revision-ready',status:'creation_ready',intent:{goal:'完成原任务',constraints:['只在工作区','不得外传']},creation:{...structuredClone(creation),contentHash:'a'.repeat(64),childId:'reserved-child',runStatus:'claimed'}};
  const service={
    async prepareCreation(){return structuredClone(snapshot);},
    async claimCreation(input,actor,options){claims.push({input,actor,options});return{claim,...structuredClone(snapshot)};},
    async status(){return structuredClone(snapshot);},
    async recordCreation(args){records.push(args);if(failRecord)throw Error('PRIVATE_SECRET');snapshot.creation.runStatus=args.status;snapshot.creation.result=args.result;snapshot.creation.stopReason=args.stopReason;return structuredClone(snapshot);},
  };
  const ctx={tools:{guard(fn){guards.push(fn);return()=>guards.splice(guards.indexOf(fn),1);}},subagents:{
    resolveMaxDepth:()=>1,
    async startActivation(spec){starts.push(spec);if(startError)throw startError;return{childId:'reserved-child',messageId:'accepted',result:Promise.resolve(result??{stopReason:'completed',structured:{pluginDirectory:'/safe/workspace/plugin',summary:'创建完成'},output:[]}),async dispose(){starts.push('disposed');}};},
  }};
  const exec={agent:{id:caller.sessionId,options:{},session:{id:caller.sessionId,header:{delegationDepth:0}}},callId:'call-1',signal:signal??new AbortController().signal};
  return{records,starts,guards,claims,snapshot,service,ctx,exec};
}

test('creator reserves exact durable identity and returns structured result through original caller',async()=>{
  const f=fixture();const out=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(f.starts.length,1);const start=f.starts[0];
  assert.equal(start.childId,'reserved-child');assert.equal(start.provider,'spawn');assert.equal(start.delivery,'caller');
  assert.equal(start.request.parent,f.exec.agent);assert.equal(start.request.cwd,caller.directory);assert.equal(start.request.agentPreset,'cordis');assert.equal(start.request.maxDepth,1);
  assert.equal(start.request.outputSchema.required.includes('pluginDirectory'),true);
  assert.equal(f.claims[0].options.promptHash,createHash('sha256').update(start.request.prompt[0].text).digest('hex'));
  assert.equal(f.claims[0].options.expectedRevisionId,f.snapshot.revisionId);assert.equal(f.claims[0].options.expectedContentHash,f.snapshot.creation.contentHash);
  assert.equal(f.records[0].status,'running');assert.equal(f.records.at(-1).status,'completed');
  assert.equal(JSON.parse(out.creation.result).pluginDirectory,'/safe/workspace/plugin');
  assert.match(start.request.prompt[0].text,/不得安装|不要安装/u);assert.match(start.request.prompt[0].text,/只在工作区/u);assert.match(start.request.prompt[0].text,/不得外传/u);
  assert.equal(f.guards.length,0);
});

test('existing claim is observed and never spawns again',async()=>{
  const f=fixture({claim:'existing'});
  assert.equal((await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).requestId,'request-a');
  assert.equal(f.starts.length,0);assert.equal(f.records.length,0);
});

test('a stale prepared specification returns the current request without starting or recording a child',async()=>{
  const f=fixture({claim:'stale'});f.service.status=async()=>({...f.snapshot,revisionId:'new-revision',creation:{...f.snapshot.creation,answers:[{id:'layout',answer:'B'}]}});
  const result=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(result.revisionId,'new-revision');assert.equal(result.creation.answers[0].answer,'B');
  assert.equal(f.starts.length,0);assert.equal(f.records.length,0);
});

test('unknown startup errors persist unknown without leaking private details or retrying',async()=>{
  const f=fixture({startError:new Error('PRIVATE_SECRET path /private/secret')});
  const out=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(f.starts.length,1);assert.equal(out.creation.runStatus,'unknown');
  assert.equal(f.records.at(-1).status,'unknown');assert.doesNotMatch(JSON.stringify(out),/PRIVATE_SECRET/);
});

test('non-completed, missing structured, unsafe or oversize result never reports successful creation',async()=>{
  for(const result of [{stopReason:'aborted',output:[]},{stopReason:'max-tokens',output:[]},{stopReason:'completed',output:[]},{stopReason:'completed',structured:{pluginDirectory:'../escape',summary:'x'},output:[]},{stopReason:'completed',structured:{pluginDirectory:'/safe/workspace/plugin',summary:'x'.repeat(13000)},output:[]}]){
    const f=fixture({result});const out=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
    assert.notEqual(out.creation.runStatus,'completed');assert.notEqual(f.records.at(-1).status,'completed');
  }
});

test('record failure before publication stops spawn and never exposes storage diagnostics',async()=>{
  const f=fixture({failRecord:true});
  await assert.rejects(runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec),error=>error.code==='AGENT_CREATION_UNAVAILABLE'&&!error.message.includes('PRIVATE_SECRET'));
  assert.equal(f.starts.length,0);
});

test('abort after publication disposes exact activation, awaits result and does not claim rollback',async()=>{
  const abort=new AbortController(),f=fixture({signal:abort.signal});let settle;
  f.ctx.subagents.startActivation=async spec=>{f.starts.push(spec);return{childId:'reserved-child',result:new Promise(resolve=>{settle=resolve;}),async dispose(){f.starts.push('disposed');settle({stopReason:'aborted',output:[]});}};};
  const pending=runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  await new Promise(resolve=>setTimeout(resolve,0));abort.abort();
  const out=await pending;
  assert.equal(f.starts.filter(x=>x==='disposed').length,1);assert.equal(out.creation.runStatus,'unknown');assert.equal(out.creation.stopReason,'aborted');
});

test('active creator cannot recursively call Finder tools',async()=>{
  const f=fixture();
  f.ctx.subagents.startActivation=async()=>{
    assert.match(f.guards[0]({agent:{id:'reserved-child'},name:'finder_create'}),/recursive|递归/u);
    assert.equal(f.guards[0]({agent:{id:'parent-session'},name:'finder_lookup'}),undefined);
    return{childId:'reserved-child',result:Promise.resolve({stopReason:'refusal',output:[]}),dispose:async()=>{}};
  };
  await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
});

test('missing subagent runtime or oversized blueprint stops before claim',async()=>{
  const f=fixture();let claims=0;f.service.claimCreation=async()=>{claims++;throw Error('no');};
  f.ctx.subagents=undefined;
  await assert.rejects(runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec),error=>error.code==='AGENT_CREATION_UNAVAILABLE');assert.equal(claims,0);
  assert.throws(()=>buildCreatorPrompt({intent:{constraints:['x']},creation:{blueprint:{purpose:'x'.repeat(70000)}}},caller),error=>error.code==='AGENT_CREATION_UNAVAILABLE');
});

test('a large saved handoff draft is preserved but not duplicated in the bounded Creator payload',()=>{
  const snapshot={requestId:'bounded-source',originalRequest:'原始目标和验收原文：保留既有材料，不得外传。',intent:{goal:'完成原目标',constraints:['不得外传','保留既有材料']},creation:{
    ...structuredClone(creation),draft:'历史交接稿内容'.repeat(12000),assumptions:['保持未核事实'],answers:[{id:'layout',answer:'当前需求中的布局',assumed:true}],
  }};
  const before=structuredClone(snapshot);
  assert.ok(Buffer.byteLength(snapshot.creation.draft)>60000);
  const prompt=buildCreatorPrompt(snapshot,caller),payload=JSON.parse(prompt.split('引用任务数据：\n')[1]);
  assert.equal(payload.creation.draft,undefined);assert.deepEqual(payload.intent.constraints,snapshot.intent.constraints);assert.equal(payload.originalRequest,snapshot.originalRequest);
  assert.deepEqual(payload.creation.blueprint,snapshot.creation.blueprint);assert.deepEqual(payload.creation.answers,snapshot.creation.answers);
  assert.deepEqual(payload.creation.assumptions,snapshot.creation.assumptions);assert.deepEqual(payload.creation.supply,snapshot.creation.supply);
  assert.ok(Buffer.byteLength(prompt)<18000);assert.deepEqual(snapshot,before);
});

test('the actual Creator prompt binds generated runtime access to the trusted caller workspace',async()=>{
  const f=fixture();f.snapshot.creation.blueprint.runtime='从 registry 读取所有工作区，未配置时回退 process.cwd()';
  f.snapshot.intent.directory='/other/model-supplied-workspace';
  await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  const prompt=f.starts[0].request.prompt[0].text,payload=JSON.parse(prompt.split('引用任务数据：\n')[1]);
  assert.deepEqual(payload.trustedWorkspace,{directory:caller.directory,workspaceId:caller.workspaceId,parentSessionId:caller.sessionId});
  assert.match(prompt,/运行时.{0,30}绑定/u);
  assert.match(prompt,/不得.{0,50}其他工作区/u);
  assert.match(prompt,/不得.{0,60}process\.cwd/u);
  assert.match(prompt,/缺少.{0,40}绑定.{0,40}拒绝/u);
  assert.match(prompt,/每次[^。\n]*route[^。\n]*tool[^。\n]*session[^。\n]*workspace/u);
  assert.match(prompt,/owner[^。\n]*不[^。\n]*工作区/u);
  assert.match(prompt,/读取[^。\n]*之前[^。\n]*目录[^。\n]*symlink/u);
  assert.match(prompt,/读改写[^。\n]*锁[^。\n]*并发/u);
  assert.match(prompt,/写入[^。\n]*之前[^。\n]*容量[^。\n]*不变/u);
});

test('a pre-install caller review is not mislabeled verified failure or installation evidence',()=>{
 const f=fixture();f.snapshot.repairCount=1;f.snapshot.repairPhase='preinstall';f.snapshot.repairFeedback='调用方源码审查意见，尚未安装';
 f.snapshot.repairContext={previousPluginDirectory:'/safe/workspace/old',previousPackageName:'@local/old',previousVersion:'0.1.0',previousFingerprint:'a'.repeat(64)};
 const prompt=buildCreatorPrompt(f.snapshot,caller),payload=JSON.parse(prompt.split('引用任务数据：\n')[1]);
 assert.equal(payload.repairPhase,'preinstall');assert.match(prompt,/caller_reported_review/u);assert.match(prompt,/observed_absent/u);assert.match(prompt,/不是[^。\n]*漏洞[^。\n]*验证/u);assert.match(prompt,/审批拒绝[^。\n]*不[^。\n]*代码失败/u);
 assert.doesNotMatch(prompt,/这是已知失败后的第/u);assert.match(prompt,/新的唯一 npm 包名/u);
});

test('a bounded repair prompt preserves original constraints and uses new identities and data rather than the failed artifact',async()=>{
  const f=fixture();f.snapshot.repairCount=1;f.snapshot.repairFeedback='真实应用失败：cannot get property "webServer" without inject';
  f.snapshot.repairContext={previousPluginDirectory:'/safe/workspace/previous-plugin',previousSourceDirectory:'/safe/workspace/previous-plugin',previousPackageName:'@local/previous-plugin',previousVersion:'0.1.0',previousFingerprint:'b'.repeat(64),failureHint:{kind:'missing-injection',service:'webServer'}};
  f.snapshot.originalRequest='保留原始验收和限制，不覆盖任何已有产物。';
  const prior=structuredClone(f.snapshot);
  const prompt=buildCreatorPrompt(f.snapshot,caller),payload=JSON.parse(prompt.split('引用任务数据：\n')[1]);
  assert.equal(payload.repairCount,1);assert.equal(payload.repairFeedback,prior.repairFeedback);assert.equal(payload.originalRequest,prior.originalRequest);assert.deepEqual(payload.repairContext,prior.repairContext);assert.deepEqual(f.snapshot,prior);
  assert.match(prompt,/只读.{0,35}repairContext/u);assert.match(prompt,/复制.{0,35}独立目录/u);
  for(const fact of [/新.{0,25}独立目录/u,/包名/u,/patch id/u,/panel id/u,/RPC channel/u,/工具名/u,/独立.{0,15}数据子目录/u,/不得.{0,45}复用.{0,45}旧/u])assert.match(prompt,fact);
  assert.match(prompt,/connection\.fetch\.register/u);
  assert.match(prompt,/cordis_inspect_list/u);assert.match(prompt,/cordis_inspect_query/u);assert.match(prompt,/Client.{0,45}超时.{0,100}ASAR/u);
  assert.match(prompt,/RuntimeInterception/u);assert.match(prompt,/lib/u);
  assert.match(prompt,/否定/u);assert.match(prompt,/负数/u);assert.match(prompt,/小数/u);assert.match(prompt,/多命令/u);
  await runAgentCreation(f.ctx,f.service,{requestId:'request-a',feedback:prior.repairFeedback},caller,f.exec);
  assert.equal(f.claims[0].options.promptHash,createHash('sha256').update(f.starts[0].request.prompt[0].text).digest('hex'));
  assert.equal(f.claims[0].options.expectedContentHash,prior.creation.contentHash);
});

test('Creator communication guidance uses the verified authenticated Fetch route without claiming consumer injection fixes generic RPC',()=>{
  const f=fixture(),prompt=buildCreatorPrompt(f.snapshot,caller);
  assert.match(prompt,/ctx\.connection\.fetch\.register/u);
  assert.match(prompt,/path:\s*'\/api\/<unique>\/op'/u);assert.match(prompt,/methods:\s*\['POST'\]/u);assert.match(prompt,/requestBody:\s*'buffered'/u);assert.match(prompt,/Response\.json/u);
  assert.match(prompt,/owner.{0,35}认证|认证.{0,35}owner/u);assert.match(prompt,/credentials:\s*'same-origin'/u);
  for(const guard of [/Content-Type/u,/JSON/u,/字节/u,/req\.signal/u,/engine/u,/工作区/u,/不得.{0,30}另开.{0,20}server/u])assert.match(prompt,guard);
  assert.match(prompt,/不能.{0,50}追加.{0,30}webServer.{0,30}修复/u);
  assert.doesNotMatch(prompt,/插件必须显式 inject webServer|最小声明示例为 export const inject/u);
  assert.match(prompt,/不要.{0,45}猜.{0,30}依赖/u);assert.match(prompt,/Client.{0,45}超时.{0,100}ASAR/u);
});

test('repair references are bounded workspace data and never serialize unrelated private history',()=>{
  const f=fixture();f.snapshot.repairCount=1;f.snapshot.repairFeedback='已核失败';
  f.snapshot.repairContext={previousPluginDirectory:'/safe/workspace/prior',previousPackageName:'@local/prior',privateHistory:'PRIVATE_HISTORY_MUST_STAY_SERVER_SIDE',failureHint:{kind:'missing-injection',service:'webServer',diagnostic:'PRIVATE_STACK'}};
  const prompt=buildCreatorPrompt(f.snapshot,caller),payload=JSON.parse(prompt.split('引用任务数据：\n')[1]);
  assert.deepEqual(payload.repairContext,{previousPluginDirectory:'/safe/workspace/prior',previousPackageName:'@local/prior',failureHint:{kind:'missing-injection',service:'webServer'}});assert.doesNotMatch(prompt,/PRIVATE_HISTORY|PRIVATE_STACK/u);
  for(const previousPluginDirectory of ['/safe/workspace','/other/prior','relative/prior'])assert.throws(()=>buildCreatorPrompt({...f.snapshot,repairContext:{previousPluginDirectory,previousPackageName:'@local/prior'}},caller),error=>error.code==='AGENT_CREATION_UNAVAILABLE');
});

test('malformed or unbounded repair metadata cannot acquire a Creator claim',async()=>{
  for(const patch of [{repairCount:3,repairFeedback:'x'},{repairCount:1,repairFeedback:'x'.repeat(3001)},{repairCount:1},{repairCount:-1,repairFeedback:'x'}]){
    const f=fixture();Object.assign(f.snapshot,patch);
    await assert.rejects(runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec),error=>error.code==='AGENT_CREATION_UNAVAILABLE');
    assert.equal(f.claims.length,0);assert.equal(f.starts.length,0);
  }
});

test('newly matched supply or unresolved creation questions return without reserving a child',async()=>{
  for(const status of ['planned','creation_draft','creating','creation_unknown']){
    const f=fixture();let claims=0;f.service.prepareCreation=async()=>({...f.snapshot,status});f.service.claimCreation=async()=>{claims++;throw Error('not allowed');};
    assert.equal((await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).status,status);
    assert.equal(claims,0);assert.equal(f.starts.length,0);
  }
});

test('a mismatched published child is stopped instead of leaving an untracked task running',async()=>{
  const f=fixture();let disposed=0;
  f.ctx.subagents.startActivation=async()=>({childId:'wrong-child',result:Promise.resolve({stopReason:'completed',output:[]}),async dispose(){disposed++;}});
  const out=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(disposed,1);assert.equal(out.creation.runStatus,'unknown');assert.equal(f.guards.length,0);
});

test('failure to register recursive-call guard is contained before starting a child',async()=>{
  const f=fixture();f.ctx.tools.guard=()=>{throw Error('PRIVATE_RUNTIME_PATH');};
  const out=await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(f.starts.length,0);assert.equal(out.creation.runStatus,'unknown');assert.doesNotMatch(JSON.stringify(out),/PRIVATE_RUNTIME_PATH/);
});

test('Creator is a leaf even when the host permits deeper delegation, and descendants cannot install',async()=>{
  const f=fixture();f.ctx.subagents.resolveMaxDepth=()=>10;
  f.ctx.subagents.startActivation=async spec=>{
    f.starts.push(spec);assert.equal(spec.request.maxDepth,1);
    for(const name of ['subagent','subagent_fork','workflow'])assert.match(f.guards[0]({agent:{id:'reserved-child'},name}),/leaf|委派/u);
    assert.match(f.guards[0]({agent:{id:'unexpected-grandchild',session:{header:{parentSession:'reserved-child'}}},name:'plugin_manager'}),/Creator/u);
    return{childId:'reserved-child',result:Promise.resolve({stopReason:'refusal',output:[]}),dispose:async()=>{}};
  };
  await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
});

test('runtime depth cannot lower a persisted parent depth or exceed the host limit',async()=>{
  const f=fixture();f.exec.agent.session.header.delegationDepth=2;f.exec.agent.options.subagentDepth=0;f.ctx.subagents.resolveMaxDepth=()=>10;
  await runAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);assert.equal(f.starts[0].request.maxDepth,3);
  for(const invalid of [NaN,-1,1.5]){
    const bad=fixture();bad.exec.agent.options.subagentDepth=invalid;
    await assert.rejects(runAgentCreation(bad.ctx,bad.service,{requestId:'request-a'},caller,bad.exec),error=>error.code==='AGENT_CREATION_UNAVAILABLE');assert.equal(bad.records.length,0);
  }
  const limited=fixture();limited.ctx.subagents.resolveMaxDepth=()=>0;
  await assert.rejects(runAgentCreation(limited.ctx,limited.service,{requestId:'request-a'},caller,limited.exec),error=>error.code==='AGENT_CREATION_UNAVAILABLE');assert.equal(limited.records.length,0);
});

function recoveryFixture({ptc=false}={}){
  const f=fixture();f.snapshot.status='creation_unknown';f.snapshot.creation.runStatus='unknown';
  const schema={type:'object',additionalProperties:false,required:['pluginDirectory','summary'],properties:{pluginDirectory:{type:'string'},summary:{type:'string'}}};
  const structured={pluginDirectory:'/safe/workspace/plugin',summary:'已创建并运行本地测试'};
  const events=[];const add=(type,data)=>{events.push({seq:events.length,time:1000+events.length,type,data});};
  add('turn/start',{turn:1});add('agent-preset/selected',{agentPreset:'cordis'});add('subagent/descriptor',{version:3,mode:'continuable',provider:'spawn',label:'创建缺失的插件能力'});
  add('working-directory/change',{cwd:caller.directory});
  add('user/message',{turn:1,step:1,role:'user',source:{kind:'user'},content:[{type:'text',text:buildCreatorPrompt(f.snapshot,caller)}]});
  add('request/header',{header:{tools:ptc?[{name:'run_code',parameters:{type:'object'}}]:[{name:'structured_output',parameters:schema}]}});
  if(ptc){
    add('tool/call',{turn:1,step:1,name:'run_code',callId:'outer',arguments:'{}'});
    add('tool/ptc-dispatch-start',{rootCallId:'outer',parentCallId:'outer',subCallId:'inner',name:'structured_output',arguments:structured});
    add('tool/ptc-dispatch',{rootCallId:'outer',parentCallId:'outer',subCallId:'inner',name:'structured_output',arguments:structured,isError:false,content:[{type:'text',text:'Structured output recorded.'}]});
    add('tool/result',{turn:1,step:1,message:{role:'tool',toolCallId:'outer',isError:false,content:[]}});
  }else{
    add('tool/call',{turn:1,step:1,name:'structured_output',callId:'capture',arguments:JSON.stringify(structured)});
    add('tool/result',{turn:1,step:1,message:{role:'tool',toolCallId:'capture',isError:false,content:[{type:'text',text:'Structured output recorded.'}]}});
  }
  add('step/end',{turn:1,step:1});add('turn/end',{turn:1,reason:{kind:'completed'}});
  const header={id:'reserved-child',parentSession:caller.sessionId,cwd:caller.directory,isSeeded:false,origin:'subagent',agentPreset:'cordis',createdAt:1000};
  let disposed=0,reads=0,catalogReads=0;
  const lease={header,events,inheritedEventCount:0,cursor:events.length-1,[Symbol.dispose](){disposed++;}};
  f.ctx.subagents.listChildren=async id=>{catalogReads++;assert.equal(id,caller.sessionId);return[{id:'reserved-child',mode:'continuable',createdAt:1000}];};
  f.ctx.get=name=>name==='sessionQuery'?{async observeSession(id){reads++;assert.equal(id,'reserved-child');return lease;}}:undefined;
  return{...f,events,header,lease,get disposed(){return disposed;},get reads(){return reads;},get catalogReads(){return catalogReads;}};
}

test('unknown creation recovers only its original native structured tool success without starting another child',async()=>{
  const f=recoveryFixture();
  const result=await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(result.creation.runStatus,'completed');assert.equal(f.starts.length,0);assert.equal(f.reads,1);assert.equal(f.disposed,1);
  assert.equal(JSON.parse(result.creation.result).pluginDirectory,'/safe/workspace/plugin');
});

test('PTC structured capture also requires its enclosing run_code success',async()=>{
  const f=recoveryFixture({ptc:true});
  assert.equal((await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).creation.runStatus,'completed');
  const failed=recoveryFixture({ptc:true});failed.events.find(event=>event.type==='tool/result').data.message.isError=true;
  assert.notEqual((await observeAgentCreation(failed.ctx,failed.service,{requestId:'request-a'},caller,failed.exec)).creation.runStatus,'completed');assert.equal(failed.records.length,0);
});

test('an immutable claim prompt hash recovers the exact original child across template upgrades',async()=>{
  const f=recoveryFixture(),message=f.events.find(event=>event.type==='user/message');
  message.data.content[0].text='旧模板的原始执行消息\n'+message.data.content[0].text;
  f.snapshot.creation.promptHash=createHash('sha256').update(message.data.content[0].text).digest('hex');
  assert.equal((await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).creation.runStatus,'completed');
  for(const hash of ['malformed','a'.repeat(64)]){
    const bad=recoveryFixture();bad.snapshot.creation.promptHash=hash;
    assert.notEqual((await observeAgentCreation(bad.ctx,bad.service,{requestId:'request-a'},caller,bad.exec)).creation.runStatus,'completed');assert.equal(bad.records.length,0);
  }
});

test('foreign child, altered prompt, failed capture and later run never acquire completion authority',async()=>{
  for(const mutate of [
    f=>{f.header.parentSession='other';},
    f=>{f.events.find(event=>event.type==='user/message').data.content[0].text='model supplied directory /safe/workspace/plugin';},
    f=>{f.events.find(event=>event.type==='tool/result').data.message.isError=true;},
    f=>{f.events.push({seq:f.events.length,type:'turn/start',data:{turn:2}});f.lease.cursor++;},
    f=>{f.header.isSeeded=true;},
    f=>{f.header.cwd='/other';},
  ]){
    const f=recoveryFixture();mutate(f);
    assert.notEqual((await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).creation.runStatus,'completed');
    assert.equal(f.records.length,0);assert.equal(f.starts.length,0);assert.equal(f.disposed,1);
  }
});

test('missing parent catalog membership prevents even reading the child',async()=>{
  const f=recoveryFixture();f.ctx.subagents.listChildren=async()=>[];
  await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec);
  assert.equal(f.reads,0);assert.equal(f.records.length,0);
});

test('running or unbounded child histories remain observation only',async()=>{
  for(const mutate of [f=>f.events.pop(),f=>{f.lease.cursor=1000000;}]){
    const f=recoveryFixture();mutate(f);
    assert.notEqual((await observeAgentCreation(f.ctx,f.service,{requestId:'request-a'},caller,f.exec)).creation.runStatus,'completed');assert.equal(f.records.length,0);assert.equal(f.starts.length,0);
  }
});

test('real service prepared to claimed/running/unknown projections preserve the original Creator prompt',async()=>{
  const rows=new Map();
  const blueprint=Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(key=>[key,key+' 已确认边界']));
  const intent={goal:'真实能力缺口',input:'工作区合成资料',output:'可用本地插件',constraints:[],capabilities:['记录'],queries:['local counter']};
  const model={status:()=>({configured:true}),async call(args){
    if(args.system.includes('本阶段只抽取'))return{text:JSON.stringify(intent)};
    if(args.system.includes('CREATION_CONFIRM_SCHEMA'))return{text:JSON.stringify({intent:args.data.priorIntent,blueprint:args.data.creation.blueprint})};
    if(args.data.trigger)return{text:JSON.stringify({strategy:'new',reuseAssessment:'已核范围仍有缺口',candidateDecisions:[],questions:[],assumptions:[],blueprint})};
    return{text:JSON.stringify({kind:'gap',title:'有界本地能力',rationale:'已查范围未确认满足',pluginIds:[],steps:[],limits:['未检查范围仍未知']})};
  }};
  const discovery={search:async()=>({candidates:[],sources:[{id:'fixture',status:'live'}],coverage:{matched:0,inspected:0,uninspected:0},sourceCoverage:[],warnings:[],searchedAt:'2026-10-26T12:00:00Z'})};
  const service=createAgentFinderService({store:{read:async id=>structuredClone(rows.get(id)),write:async row=>{rows.set(row.id,structuredClone(row));}},
    createCore:({historyStore})=>createFinderService({historyStore,model,discovery,hostVersion:'0.2.1-rc.3'})});
  const found=await service.find({goal:'制作本地专用能力',acceptance:'可运行且有测试',constraints:['不得修改其他项目']},caller,{callId:'real-core-prompt'});
  const prepared=await service.prepareCreation({requestId:found.requestId},caller);
  assert.equal(prepared.status,'creation_ready');assert.equal(prepared.creation.childId,undefined);
  const originalPrompt=buildCreatorPrompt(prepared,caller),claim=await service.claimCreation({requestId:found.requestId},caller);
  const running=await service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'running'},caller);
  const unknown=await service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'unknown',result:'{"summary":"等待核对"}'},caller);
  for(const snapshot of [claim,running,unknown])assert.equal(buildCreatorPrompt(snapshot,caller),originalPrompt);
  const future={...unknown,creation:{...unknown.creation,observationRevision:123,observation:{status:'unverified'}}};
  assert.equal(buildCreatorPrompt(future,caller),originalPrompt);
  // The old whole-object serializer changes its task bytes as soon as the service adds runtime facts.
  assert.notEqual(JSON.stringify(prepared.creation),JSON.stringify(unknown.creation));
  const f=recoveryFixture();f.header.id=claim.childId;
  f.events.find(event=>event.type==='user/message').data.content[0].text=originalPrompt;
  f.ctx.subagents.listChildren=async()=>[{id:claim.childId,mode:'continuable',createdAt:f.header.createdAt}];
  f.ctx.get=name=>name==='sessionQuery'?{observeSession:async id=>{assert.equal(id,claim.childId);return f.lease;}}:undefined;
  const recovered=await observeAgentCreation(f.ctx,service,{requestId:found.requestId},caller,f.exec);
  assert.equal(recovered.creation.runStatus,'completed');assert.equal(f.starts.length,0);
});
