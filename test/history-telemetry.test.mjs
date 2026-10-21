import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFinderService} from '../src/service.js';
import {createHistoryRepository,MAX_TASK_BYTES,MAX_TELEMETRY_BYTES,ORIGIN_RESERVE_BYTES} from '../src/history.js';
import {createTelemetry} from '../src/telemetry.js';
import {POLICY_VERSION} from '../src/telemetry-contract.js';
const copy=value=>structuredClone(value),hash=value=>createHash('sha256').update(value).digest('hex');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const intent={goal:'整理资料',input:'Markdown',output:'资料库',constraints:['原文只读'],capabilities:['本地检索'],queries:['local search']};
const plugin={id:'local',name:'local',capabilities:['本地检索'],requirements:{extraApiKey:'not-required'},install:{spec:'local@1.2.0',type:'npm',version:'1.2.0'}};
const plan={kind:'single',title:'资料库',rationale:'待验收',pluginIds:['local'],steps:[{capability:'本地检索',owner:'local',sourceCapability:'本地检索',action:'检索',input:'Markdown',output:'结果'}],limits:[]};
const identity=w=>({taskId:w.taskId,revisionId:w.revisionId});
function persistence(){
 const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};
 const control={failWrite:false,failPointer:false,writes:[],rows};
 const store={read:async id=>copy(rows.get(id)),write:async row=>{if(control.failWrite)throw Error('fail');rows.set(row.id,copy(row));control.writes.push(copy(row));},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async v=>{if(control.failPointer)throw Error('fail');pointer=copy(v);}};
 return{store,control};
}
function telemetry(){
 const control={epoch:null,captureError:false,eventError:false,created:[],commits:0};
 const api={capture:async()=>{if(control.captureError)throw Error('private credential');return control.epoch?{epochId:control.epoch,policyVersion:'v1'}:null;},createEvent:async args=>{
  if(control.eventError)throw Error('private credential');
  if(!args.context||args.context.epochId!==control.epoch)return null;
  control.created.push(copy(args));return{schemaVersion:1,eventId:hash(control.epoch+'|'+args.type+'|'+args.key),epochId:control.epoch,taskId:hash(args.task.id),revisionId:hash(args.revision.id),type:args.type,occurredAt:'2026-10-20T12:00:00Z',clientVersion:'test',hostVersion:'test',data:{plugins:[{name:'local',version:'1.2.0',commit:null,repository:null,sourceType:'npm',modelSelected:true,userSelected:args.type==='plan_selected',installationStatus:'unknown'}]}};
 },committed:()=>{control.commits++;}};
 return{api,control};
}
function fixture({persist=persistence(),report=telemetry(),modelCall}={}){
 const service=createFinderService({historyStore:persist.store,telemetry:report.api,discovery:{search:async()=>({candidates:[plugin],sources:[{status:'live'}],warnings:[]})},model:{status:()=>({configured:true}),call:async args=>modelCall?modelCall(args):({text:JSON.stringify(args.system.includes('仅允许 {"kind"')?plan:intent),model:{label:'host'}})}});
 return{service,persist,report};
}
async function planned(f){const a=await f.service.analyze({request:'整理资料，原文只读'});return f.service.recommend({...identity(a.workflow),intent:a.intent});}
const storedTask=f=>JSON.parse([...f.persist.control.rows.values()][0].serialized);

test('default off and historical reopening do not create reporting events or backfill old recommendations',async()=>{
 const f=fixture(),p=await planned(f);assert.equal(storedTask(f).telemetryEvents,undefined);
 f.report.control.epoch=A;await f.service.bootstrap();await f.service.history();await f.service.open(identity(p.workflow));
 assert.deepEqual(await f.service.pendingTelemetry(A),[]);assert.equal(f.report.control.created.length,0);
});

test('confirmed intent and new plan events are durable with their exact task revision and hidden from ordinary responses',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f),task=storedTask(f);
 assert.deepEqual(task.telemetryEvents.map(e=>e.type),['intent_confirmed','plan_generated']);
 assert.equal(task.telemetryEvents[0].revisionId,hash(task.revisions[0].id));assert.equal(task.telemetryEvents[1].revisionId,hash(p.workflow.revisionId));
 const planWrite=f.persist.control.writes.map(row=>JSON.parse(row.serialized)).find(t=>t.revisions.length===2);
 assert.equal(planWrite.telemetryEvents.at(-1).type,'plan_generated');assert.equal(planWrite.revisions.at(-1).workflow.plan.title,plan.title);
 assert.ok(!JSON.stringify(p).includes('telemetryEvents'));assert.equal(f.report.control.commits,2);
});

test('selection is idempotent before handoff and stale or missing identities cannot write another task',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f),ids=identity(p.workflow);
 assert.equal((await f.service.selectPlan(ids)).saved,true);await f.service.selectPlan(ids);
 assert.equal(storedTask(f).telemetryEvents.filter(e=>e.type==='plan_selected').length,1);
 await assert.rejects(f.service.handoff({...ids,workspaceId:'',sessionId:'',status:'blocked'}));
 assert.equal(storedTask(f).telemetryEvents.filter(e=>e.type==='plan_selected').length,1);
 await assert.rejects(f.service.selectPlan({}),e=>e.code==='STALE_WORKFLOW');
 await f.service.reset(ids);await f.service.analyze({request:'另一个任务，原文只读'});
 await assert.rejects(f.service.selectPlan(ids),e=>e.code==='STALE_WORKFLOW');
});

test('new feedback, refinement and native draft outcomes remain reported or draft evidence with exact plugin versions',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f),ids=identity(p.workflow);
 await f.service.feedback({...ids,outcome:'partial',note:'筛选不准',pluginIds:['local']});
 await f.service.handoff({...ids,workspaceId:'private-workspace',sessionId:'private-session',status:'applied'});
 const refined=await f.service.refine({...ids,feedback:'更窄的检索'});const task=storedTask(f);
 assert.deepEqual(task.telemetryEvents.map(e=>e.type),['intent_confirmed','plan_generated','feedback_submitted','handoff_prepared','refinement_submitted']);
 const feedback=f.report.control.created.find(x=>x.type==='feedback_submitted');assert.equal(feedback.feedback.outcome,'partial');assert.equal(feedback.revision.id,ids.revisionId);
 const refinement=f.report.control.created.find(x=>x.type==='refinement_submitted');assert.equal(refinement.feedback.note,'更窄的检索');assert.equal(refinement.key,refined.workflow.revisionId);
 const draft=f.report.control.created.find(x=>x.type==='handoff_prepared');assert.equal(draft.draftStatus,'applied');
});

test('revocation during a model operation prevents a new event even after a different epoch is enabled',async()=>{
 let release,started;const began=new Promise(r=>{started=r;});const held=new Promise(r=>{release=r;});
 const f=fixture({modelCall:async args=>{
  if(args.system.includes('仅允许 {"kind"')){started();await held;}
  return{text:JSON.stringify(args.system.includes('仅允许 {"kind"')?plan:intent),model:{label:'host'}};
 }});
 f.report.control.epoch=A;const a=await f.service.analyze({request:'整理资料，原文只读'});const pending=f.service.recommend({...identity(a.workflow),intent:a.intent});await began;
 f.report.control.epoch=B;release();await pending;
 assert.deepEqual(storedTask(f).telemetryEvents.map(x=>x.type),['intent_confirmed']);assert.deepEqual(await f.service.pendingTelemetry(B),[]);
});

test('consent granted while asynchronous capture is pending cannot adopt an already-started operation',async()=>{
 const f=fixture(),a=await f.service.analyze({request:'整理资料，原文只读'});
 let release,started;const held=new Promise(r=>{release=r;}),began=new Promise(r=>{started=r;});
 f.report.api.capture=async()=>{started();await held;return{epochId:A,policyVersion:'v1',acceptedAt:new Date().toISOString()};};
 const pending=f.service.recommend({...identity(a.workflow),intent:a.intent});await began;await new Promise(r=>setTimeout(r,5));f.report.control.epoch=A;release();await pending;
 assert.equal(storedTask(f).telemetryEvents,undefined);
});

test('telemetry capture/projection failures never erase a successful business save or leak the internal error',async()=>{
 for(const key of ['captureError','eventError']){
  const f=fixture();f.report.control.epoch=A;f.report.control[key]=true;const p=await planned(f);
  assert.equal(p.workflow.plan.title,plan.title);assert.equal(storedTask(f).revisions.length,2);
  assert.ok(p.telemetryWarning);assert.ok(!JSON.stringify(p).includes('private credential'));
 }
});

test('failed atomic history write never starts a flush; committed event survives a later pointer failure',async()=>{
 const f=fixture();f.report.control.epoch=A;const a=await f.service.analyze({request:'整理资料，原文只读'});
 f.persist.control.failWrite=true;await assert.rejects(f.service.recommend({...identity(a.workflow),intent:a.intent}),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.report.control.commits,0);assert.deepEqual(await f.service.pendingTelemetry(A),[]);
 f.persist.control.failWrite=false;f.persist.control.failPointer=true;await assert.rejects(f.service.recommend({...identity(a.workflow),intent:a.intent}),e=>e.code==='HISTORY_STORAGE_FAILED');
 assert.equal((await f.service.pendingTelemetry(A)).filter(e=>e.type==='plan_generated').length,1);assert.ok(f.report.control.commits>0);
});

test('export and malicious or old backup imports strip transport metadata and do not conflict with existing content hashes',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f);const backup=await f.service.exportTask({taskId:p.workflow.taskId});
 assert.equal(backup.task.telemetryEvents,undefined);
 const tainted=copy(backup);tainted.task.telemetryEvents=storedTask(f).telemetryEvents;
 assert.equal((await f.service.importBackup({workflow:tainted,origin:'same backup'})).duplicate,true);
 const other=fixture();other.report.control.epoch=B;await other.service.importBackup({workflow:tainted,origin:'restored'});
 assert.equal(storedTask(other).telemetryEvents,undefined);assert.deepEqual(await other.service.pendingTelemetry(B),[]);
});

test('telemetry-only selection cannot change business content hashes or make an unchanged backup conflict',async()=>{
 const f=fixture(),p=await planned(f),backup=await f.service.exportTask({taskId:p.workflow.taskId});
 await new Promise(r=>setTimeout(r,5));f.report.control.epoch=A;await f.service.selectPlan(identity(p.workflow));
 assert.equal((await f.service.importBackup({workflow:backup,origin:'unchanged business backup'})).duplicate,true);
});

test('pending event reads are cloned, epoch filtered and keep stable IDs across restarts',async()=>{
 const f=fixture();f.report.control.epoch=A;await planned(f);const pending=await f.service.pendingTelemetry(A);
 pending[0].data.plugins[0].version='changed';const next=fixture({persist:f.persist,report:f.report});
 const again=await next.service.pendingTelemetry(A);assert.equal(again[0].data.plugins[0].version,'1.2.0');assert.equal(again[0].eventId,pending[0].eventId);assert.deepEqual(await next.service.pendingTelemetry(B),[]);
});

test('a full telemetry allocation preserves queued events and still saves new business feedback with a visible warning',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f),task=storedTask(f);
 const padding={summary:'x'.repeat(500),capabilities:Array(6).fill('c'.repeat(150)),constraints:Array(6).fill('r'.repeat(200))};
 const seed={...task.telemetryEvents[0],data:{...task.telemetryEvents[0].data,task:padding}},events=[];
 for(let i=0;;i++){const next={...seed,eventId:hash(String(i))};if(Buffer.byteLength(JSON.stringify({telemetryEvents:[...events,next]}),'utf8')>MAX_TELEMETRY_BYTES)break;events.push(next);}
 task.telemetryEvents=events;await f.persist.store.write({id:task.id,serialized:JSON.stringify(task)});
 const create=f.report.api.createEvent;f.report.api.createEvent=async args=>{const event=await create(args);return event?{...event,data:{...event.data,task:padding}}:null;};
 const result=await f.service.feedback({...identity(p.workflow),outcome:'blocked',note:'实际反馈仍须保存'});
 assert.ok(result.telemetryWarning);assert.equal(storedTask(f).feedback.at(-1).note,'实际反馈仍须保存');assert.deepEqual(storedTask(f).telemetryEvents,events);
});

test('transport metadata uses its own allocation without reducing the existing eight-megabyte business allowance',async()=>{
 const f=fixture();f.report.control.epoch=A;const p=await planned(f),task=storedTask(f);
 task.revisions.at(-1).workflow.candidates[0].documentation={text:''};
 const{telemetryEvents,...business}=task;const room=MAX_TASK_BYTES-ORIGIN_RESERVE_BYTES-Buffer.byteLength(JSON.stringify(business),'utf8')-10;
 task.revisions.at(-1).workflow.candidates[0].documentation.text='x'.repeat(room);
 await f.persist.store.write({id:task.id,serialized:JSON.stringify(task)});
 assert.ok(Buffer.byteLength(JSON.stringify(task),'utf8')>MAX_TASK_BYTES);
 const result=await f.service.selectPlan(identity(p.workflow));assert.equal(result.saved,true);
 const backup=await f.service.exportTask({taskId:p.workflow.taskId});assert.equal(backup.task.telemetryEvents,undefined);assert.ok(Buffer.byteLength(JSON.stringify(backup.task),'utf8')<MAX_TASK_BYTES);
});

test('real telemetry projection receives atomic new events and an explicit flush ACKs them without exposing local records',async()=>{
 const persist=persistence();let state,service;const sent=[];
 const api=createTelemetry({store:{read:async()=>copy(state),write:async v=>{state=copy(v);}},endpoint:'https://collector.example',autoSchedule:false,listPending:epoch=>service.pendingTelemetry(epoch),clientVersion:'test',hostVersion:'test',fetchImpl:async(url,options)=>{
  if(url.endsWith('/v1/register'))return Response.json({installationId:'anonymous',uploadToken:'upload',deleteToken:'delete'});
  const events=JSON.parse(options.body).events;sent.push(...events);return Response.json({acceptedEventIds:events.map(e=>e.eventId),receivedAt:new Date().toISOString()});
 }});
 const f=fixture({persist,report:{api,control:{}}});service=f.service;
 try{
  await api.setConsent({enabled:true,policyVersion:POLICY_VERSION});const p=await planned(f);
  await service.selectPlan(identity(p.workflow));await service.feedback({...identity(p.workflow),outcome:'partial',note:'只读 /Users/private/research.md test@example.com'});
  await api.flush();assert.equal(sent.length,4);assert.equal((await api.status()).queued,0);assert.equal((await api.status()).delivered,4);
  assert.ok(!JSON.stringify(sent).includes('/Users/'));assert.ok(!JSON.stringify(sent).includes('test@example.com'));
  const feedback=sent.find(e=>e.type==='feedback_submitted');assert.equal(feedback.data.task.summary,intent.goal);assert.equal(feedback.data.plan.title,plan.title);assert.equal(feedback.data.feedback.evidence,'user_reported');assert.equal(feedback.data.plugins[0].version,'1.2.0');
 }finally{api.close();}
});
