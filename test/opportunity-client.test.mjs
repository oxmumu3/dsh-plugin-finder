import assert from 'node:assert/strict';
import test from 'node:test';
import {createOpportunityClient} from '../src/opportunity-client.js';

const opportunity=()=>({consent:{enabled:false,epoch:1,historyTaskIds:[]},status:'idle',opportunities:[],historyChoices:[{taskId:'old-task',title:'原方案',updatedAt:'2026-10-24T12:00:00Z'}]});
function fixture({preserve=true}={}){
 let state={workspaceId:'workspace-a',workspaces:[{workspaceId:'workspace-a',title:'本工作区'}],opportunity:opportunity()},body,adoptCalls=0,applied;
 const calls=[];
 const publish=patch=>state={...state,...patch};
 const client=createOpportunityClient({getState:()=>state,publish,preserve:()=>preserve,applyResult:value=>{applied=value;},run:async(kind,path,input,apply)=>{adoptCalls++;apply({workflow:{taskId:'new-task'},adoption:{id:'adopt-a',status:'ready',workspaceId:input.workspaceId},opportunity:state.opportunity});return true;},fetchRequest:async(url,options)=>{
  const path=url.split('/').at(-1);body=options.body?JSON.parse(options.body):{};calls.push({path,body});
  if(path==='opportunity-context')return Response.json({workspaceId:body.workspaceId,title:'本工作区',files:[{path:'brief.md',name:'brief.md'}],truncated:false});
  if(path==='opportunity-grant')return Response.json({opportunity:{...state.opportunity,consent:{...body,epoch:2}}});
  if(path==='opportunity-discover')return Response.json({opportunity:{...state.opportunity,status:'ready',opportunities:[{id:'idea-a',title:'更好的办法',observation:'选定材料含重复整理',expectedResult:'一份可核对的简报',suggestedRequest:'整理选定材料',evidenceRefs:[{id:'file-a',label:'brief.md',excerpt:'明确的材料'}]}]}});
  return Response.json({opportunity:state.opportunity});
 }});
 return {client,calls,publish,get state(){return state;},get applied(){return applied;},get adoptCalls(){return adoptCalls;}};
}
test('discovery cannot run before explicit authorization',async()=>{const f=fixture();assert.equal(await f.client.methods.discoverOpportunities(),false);assert.equal(f.calls.length,0);});
test('selected materials are granted before model discovery, without sending draft or legacy history',async()=>{
 const f=fixture();await f.client.methods.openOpportunitySettings();f.client.methods.toggleOpportunityFile('brief.md');
 assert.equal(await f.client.methods.saveOpportunityScope(),true);
 assert.deepEqual(f.calls.map(c=>c.path),['opportunity-context','opportunity-grant','opportunity-discover']);
 assert.deepEqual(f.calls[1].body,{enabled:true,historyTaskIds:[],workspace:{workspaceId:'workspace-a',paths:['brief.md']}});
 assert.equal(f.state.opportunity.opportunities[0].id,'idea-a');assert.equal(f.state.opportunityEditing,false);
});
test('refused draft preservation prevents adoption and no workflow change occurs',async()=>{const f=fixture({preserve:false});f.publish({opportunity:{...opportunity(),consent:{enabled:true,epoch:1},opportunities:[{id:'idea-a'}]}});assert.equal(await f.client.methods.adoptOpportunity('idea-a'),false);assert.equal(f.adoptCalls,0);});
test('adoption checks workspace binding, then applies exact backend workflow',async()=>{
 const f=fixture();f.publish({opportunity:{...opportunity(),consent:{enabled:true,epoch:1,workspace:{workspaceId:'other'}},opportunities:[{id:'idea-a'}]}});
 assert.equal(await f.client.methods.adoptOpportunity('idea-a'),false);assert.equal(f.adoptCalls,0);
 f.publish({opportunity:{...f.state.opportunity,consent:{enabled:true,epoch:1,workspace:{workspaceId:'workspace-a'}}}});
 assert.equal(await f.client.methods.adoptOpportunity('idea-a'),true);assert.equal(f.applied.workflow.taskId,'new-task');
});
test('revocation cancels an in-flight discovery and ignores late response',async()=>{
 let state={workspaceId:'workspace-a',opportunity:{...opportunity(),consent:{enabled:true,epoch:1}}},finish;
 const c=createOpportunityClient({getState:()=>state,publish:patch=>state={...state,...patch},fetchRequest:async(url,opts)=>{
  if(url.endsWith('discover'))return new Promise(resolve=>{finish=resolve;});
  return Response.json({opportunity:{...opportunity(),consent:{enabled:false,epoch:2}}});
 }});
 const running=c.methods.discoverOpportunities();await Promise.resolve();assert.equal(await c.methods.disableOpportunities(),true);
 finish(Response.json({opportunity:{...opportunity(),consent:{enabled:true,epoch:1},status:'ready',opportunities:[{id:'late'}]}}));await running;
 assert.equal(state.opportunity.consent.enabled,false);assert.deepEqual(state.opportunity.opportunities,[]);
});

test('workspace switching while adoption awaits never applies the old context to the new workspace',async()=>{
 let state={workspaceId:'A',opportunity:{...opportunity(),consent:{enabled:true,epoch:1,workspace:{workspaceId:'A'}},opportunities:[{id:'idea-a'}]}},finish,applied=false;
 const client=createOpportunityClient({getState:()=>state,publish:patch=>state={...state,...patch},preserve:()=>true,applyResult:()=>{applied=true;},run:(kind,path,input,apply)=>new Promise(resolve=>{finish=()=>{apply({workflow:{taskId:'task-a'},adoption:{status:'ready',workspaceId:'A'}});resolve(true);};})});
 const pending=client.methods.adoptOpportunity('idea-a');state={...state,workspaceId:'B'};finish();
 assert.equal(await pending,false);assert.equal(applied,false);assert.match(state.opportunityError,/工作区已经切换/);
});

test('failed stop stays disabled locally and cannot auto-refresh even after a stale server bootstrap',async()=>{
 let state={workspaceId:'ws',opportunity:{...opportunity(),consent:{enabled:true,epoch:1}}},calls=0;const values=new Map();
 const client=createOpportunityClient({getState:()=>state,publish:patch=>state={...state,...patch},preferenceStore:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetchRequest:async()=>{calls++;throw Error('lost stop response');}});
 assert.equal(await client.methods.disableOpportunities(),false);assert.equal(state.opportunity.consent.enabled,false);
 client.apply({...opportunity(),consent:{enabled:true,epoch:1}});client.maybeRefresh();await Promise.resolve();assert.equal(calls,1);assert.equal(state.opportunity.consent.enabled,false);
});

test('one explicit recent-plan opt-in grants only the three newest available unique plan ids before discovery',async()=>{
 const f=fixture();const choices=[
  {taskId:'older',updatedAt:'2026-10-20T10:00:00Z'},
  {taskId:'newest',updatedAt:'2026-10-30T10:00:00Z'},
  {taskId:'missing',updatedAt:'2026-10-31T10:00:00Z',unavailable:true},
  {taskId:'middle',updatedAt:'2026-10-29T10:00:00Z'},
  {taskId:'newest',updatedAt:'2026-10-28T10:00:00Z'},
  {taskId:'third',updatedAt:'2026-10-28T12:00:00Z'},
  {taskId:'bad-date',updatedAt:'not-a-date'}];
 f.publish({homeRequest:'尚未提交的原始需求',opportunity:{...opportunity(),historyChoices:choices}});
 assert.equal(typeof f.client.methods.enableRecentOpportunityHistory,'function');
 assert.equal(f.calls.length,0,'opening the page must not silently authorize context');
 assert.equal(await f.client.methods.enableRecentOpportunityHistory(),true);
 assert.deepEqual(f.calls.map(c=>c.path),['opportunity-grant','opportunity-discover']);
 assert.deepEqual(f.calls[0].body,{enabled:true,historyTaskIds:['newest','middle','third']});
 assert.equal(f.state.homeRequest,'尚未提交的原始需求');
 assert.equal(f.state.opportunityEditing,false);
 assert.equal(f.state.opportunity.opportunities[0].id,'idea-a');
});

test('recent-plan opt-in neither replaces existing authorization nor invents an empty scope',async()=>{
 const f=fixture();assert.equal(typeof f.client.methods.enableRecentOpportunityHistory,'function');
 f.publish({opportunity:{...opportunity(),consent:{enabled:true,epoch:4,historyTaskIds:['old-task'],workspace:{workspaceId:'workspace-a',paths:['brief.md']}}}});
 assert.equal(await f.client.methods.enableRecentOpportunityHistory(),false);assert.equal(f.calls.length,0);
 f.publish({opportunity:{...opportunity(),historyChoices:[]}});
 assert.equal(await f.client.methods.enableRecentOpportunityHistory(),false);assert.equal(f.calls.length,0);
});

test('a failed recent-plan grant never starts discovery or clears a previously stopped preference',async()=>{
 let state={opportunity:opportunity()},calls=0;const values=new Map([['dsh.plugin-finder.opportunity-stop.v1','stopped']]);
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},preferenceStore:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetchRequest:async()=>{calls++;return Response.json({error:{message:'无法保存授权'}},{status:500});}});
 assert.equal(typeof client.methods.enableRecentOpportunityHistory,'function');
 assert.equal(await client.methods.enableRecentOpportunityHistory(),false);
 assert.equal(calls,1);assert.equal(values.get('dsh.plugin-finder.opportunity-stop.v1'),'stopped');assert.equal(state.opportunity.consent.enabled,false);
});

test('stopping while a recent-plan grant is pending defeats its late reply and any automatic discovery',async()=>{
 let state={opportunity:opportunity()},finish;const calls=[],values=new Map();
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},preferenceStore:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetchRequest:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({path:url.split('/').at(-1),body});
  if(body.enabled===true)return new Promise(resolve=>{finish=resolve;});
  return Response.json({opportunity:{...opportunity(),consent:{enabled:false,epoch:3,historyTaskIds:[]}}});
 }});
 assert.equal(typeof client.methods.enableRecentOpportunityHistory,'function');
 const enabling=client.methods.enableRecentOpportunityHistory();await Promise.resolve();
 assert.equal(await client.methods.disableOpportunities(),true);
 finish(Response.json({opportunity:{...opportunity(),consent:{enabled:true,epoch:2,historyTaskIds:['old-task']}}}));
 assert.equal(await enabling,false);assert.equal(state.opportunity.consent.enabled,false);
 client.apply({...opportunity(),consent:{enabled:true,epoch:2}});client.maybeRefresh();await Promise.resolve();
 assert.equal(state.opportunity.consent.enabled,false);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.path==='opportunity-grant'));
});

test('recent-plan opt-in is single-flight and cannot replace an active task',async()=>{
 let state={opportunity:opportunity()},finish;const calls=[];
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async(url,options)=>{
  const body=options.body?JSON.parse(options.body):{};calls.push(url.split('/').at(-1));
  if(url.endsWith('opportunity-grant'))return new Promise(resolve=>{finish=()=>resolve(Response.json({opportunity:{...state.opportunity,consent:{...body,epoch:2}}}));});
  return Response.json({opportunity:{...state.opportunity,status:'empty',opportunities:[]}});
 }});
 state={...state,execution:{phase:'running'}};assert.equal(await client.methods.enableRecentOpportunityHistory(),false);assert.equal(calls.length,0);
 state={...state,execution:null};const first=client.methods.enableRecentOpportunityHistory();await Promise.resolve();
 assert.equal(await client.methods.enableRecentOpportunityHistory(),false);assert.deepEqual(calls,['opportunity-grant']);
 finish();assert.equal(await first,true);assert.deepEqual(calls,['opportunity-grant','opportunity-discover']);
});

test('home metadata refresh is a GET and discovers nothing while consent is disabled',async()=>{
 let state={opportunity:{...opportunity(),historyChoices:[]}},request;const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async(url,options)=>{request={url,options};return Response.json({opportunity:opportunity()});}});
 assert.equal(typeof client.methods.refreshOpportunityStatus,'function');
 assert.equal(await client.methods.refreshOpportunityStatus(),true);
 assert.ok(request.url.endsWith('/opportunity-status'));assert.equal(request.options.method,'GET');assert.equal(request.options.body,undefined);
 assert.equal(state.opportunity.historyChoices.length,1);assert.equal(state.opportunity.consent.enabled,false);
});

test('home metadata refresh is single-flight and stays out of active work or scope editing',async()=>{
 let state={opportunity:opportunity(),execution:{phase:'running'}},finish,calls=0;
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(Response.json({opportunity:opportunity()}));});}});
 assert.equal(typeof client.methods.refreshOpportunityStatus,'function');
 assert.equal(await client.methods.refreshOpportunityStatus(),false);state={...state,execution:null,busy:'analyze'};
 assert.equal(await client.methods.refreshOpportunityStatus(),false);state={...state,busy:null,opportunityEditing:true};
 assert.equal(await client.methods.refreshOpportunityStatus(),false);state={...state,opportunityEditing:false};
 const first=client.methods.refreshOpportunityStatus();await Promise.resolve();assert.equal(await client.methods.refreshOpportunityStatus(),false);assert.equal(calls,1);finish();assert.equal(await first,true);
});

test('a metadata reply cannot replace a newer locally applied authorization epoch',async()=>{
 let state={opportunity:opportunity()},finish;const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async()=>new Promise(resolve=>{finish=resolve;})});
 assert.equal(typeof client.methods.refreshOpportunityStatus,'function');const pending=client.methods.refreshOpportunityStatus();await Promise.resolve();
 client.apply({...opportunity(),consent:{enabled:true,epoch:3,historyTaskIds:['new-scope']},status:'ready',opportunities:[{id:'newer'}]});
 finish(Response.json({opportunity:{...opportunity(),historyChoices:[]}}));assert.equal(await pending,false);
 assert.equal(state.opportunity.consent.epoch,3);assert.equal(state.opportunity.opportunities[0].id,'newer');
});

test('stopping during metadata refresh defeats a late enabled reply without clearing stop or starting a model',async()=>{
 let state={opportunity:opportunity()},finish;const values=new Map(),calls=[];
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},preferenceStore:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetchRequest:async(url)=>{
  calls.push(url.split('/').at(-1));if(url.endsWith('opportunity-status'))return new Promise(resolve=>{finish=resolve;});
  return Response.json({opportunity:{...opportunity(),consent:{enabled:false,epoch:2}}});
 }});
 assert.equal(typeof client.methods.refreshOpportunityStatus,'function');const pending=client.methods.refreshOpportunityStatus();await Promise.resolve();await client.methods.disableOpportunities();
 finish(Response.json({opportunity:{...opportunity(),consent:{enabled:true,epoch:1}}}));assert.equal(await pending,false);
 assert.equal(state.opportunity.consent.enabled,false);assert.equal(state.opportunity.consent.epoch,2);assert.equal(values.get('dsh.plugin-finder.opportunity-stop.v1'),'stopped');
 assert.deepEqual(calls,['opportunity-status','opportunity-grant']);
});

test('metadata refresh may update existing authorized discovery but never grants or broadens scope',async()=>{
 let state={opportunity:{...opportunity(),consent:{enabled:true,epoch:7,historyTaskIds:['old-task']},status:'ready'}},calls=[];
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async(url,options)=>{
  calls.push({path:url.split('/').at(-1),method:options.method,body:options.body});
  return Response.json({opportunity:{...state.opportunity,status:url.endsWith('opportunity-status')?'idle':'ready'}});
 }});
 assert.equal(typeof client.methods.refreshOpportunityStatus,'function');assert.equal(await client.methods.refreshOpportunityStatus(),true);
 assert.deepEqual(calls.map(c=>c.path),['opportunity-status','opportunity-discover']);assert.deepEqual(state.opportunity.consent.historyTaskIds,['old-task']);
});

test('metadata refresh cannot roll back a newer applied recommendation within the same consent epoch',async()=>{
 let state={opportunity:{...opportunity(),consent:{enabled:true,epoch:8},status:'ready'}},finish;
 const client=createOpportunityClient({getState:()=>state,publish:p=>state={...state,...p},fetchRequest:async()=>new Promise(resolve=>{finish=resolve;})});
 const pending=client.methods.refreshOpportunityStatus();await Promise.resolve();
 client.apply({...opportunity(),consent:{enabled:true,epoch:8},status:'ready',opportunities:[{id:'fresh-card'}]});
 finish(Response.json({opportunity:{...opportunity(),consent:{enabled:true,epoch:8},status:'ready',opportunities:[{id:'old-card'}]}}));
 assert.equal(await pending,false);assert.equal(state.opportunity.opportunities[0].id,'fresh-card');
});
