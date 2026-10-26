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
