// Explicit live acceptance test. Uses synthetic material and environment=test;
// it never opens the installed DSH profile or submits a real user's consent.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFinderService} from '../src/service.js';
import {createTelemetry} from '../src/telemetry.js';
import {POLICY_VERSION} from '../src/telemetry-contract.js';
import {COLLECTOR_URL,CLIENT_VERSION} from '../src/telemetry-config.js';
import {queryCollector} from './query.mjs';

export async function smokeClient({config,savePath}={}){
 const copy=value=>structuredClone(value),rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null},savedState,telemetry,service;
 const evidence={environment:'test',endpoint:COLLECTOR_URL,clientVersion:CLIENT_VERSION,steps:[],requests:[]};
 const record=(step,details={})=>{evidence.steps.push({step,...details});};
 const historyStore={read:async id=>copy(rows.get(id)),write:async row=>{rows.set(row.id,copy(row));},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}};
 const store={read:async()=>copy(savedState),write:async value=>{savedState=copy(value);}};
 const intent={goal:'合成验收：把 AI 研究整理成只读资料库',input:'Markdown',output:'可回看的资料库',constraints:['只处理指定目录','原文只读'],capabilities:['本地检索'],queries:['local search']};
 const plugin={id:'local',name:'local',capabilities:['本地检索'],requirements:{extraApiKey:'not-required'},repository:'https://github.com/example/synthetic-plugin',install:{spec:'local@1.2.0',type:'npm',version:'1.2.0'}};
 const plan={kind:'single',title:'合成验收：只读检索方案',rationale:'用合成材料验证反馈管道',pluginIds:['local'],steps:[{capability:'本地检索',owner:'local',sourceCapability:'本地检索',action:'检索指定目录',input:'Markdown',output:'带出处结果'}],limits:[]};
 let failNextEvents=true;
 const fetchImpl=async(url,options)=>{
  evidence.requests.push({path:new URL(url).pathname,method:options.method});
  if(url.endsWith('/v1/events')&&failNextEvents){failNextEvents=false;throw Error('Synthetic offline interruption');}
  return fetch(url,options);
 };
 const start=autoSchedule=>{
  telemetry=createTelemetry({store,endpoint:COLLECTOR_URL,listPending:epoch=>service.pendingTelemetry(epoch),clientVersion:CLIENT_VERSION,hostVersion:'synthetic-acceptance',environment:'test',fetchImpl,autoSchedule,retryBaseMs:500});
  service=createFinderService({historyStore,telemetry,discovery:{search:async()=>({candidates:[plugin],sources:[{status:'live',name:'synthetic acceptance fixture'}],warnings:[]})},model:{status:()=>({configured:true}),call:async args=>({text:JSON.stringify(args.system.includes('仅允许 {"kind"')?plan:intent),model:{label:'synthetic'}})}});
 };
 const waitFor=async(predicate,description)=>{const deadline=Date.now()+45000;while(Date.now()<deadline){const status=await telemetry.status();if(predicate(status))return status;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+description);};
 const query=options=>queryCollector({...config,...options});
 let deleted=false;
 try{
  start(false);
  const analyzed=await service.analyze({request:'合成验收需求。原始私密目录 /Users/SYNTHETIC/Secret Folder/source.md，不应进入中央记录。'});
  await telemetry.flush();assert.equal(evidence.requests.length,0);assert.equal(await telemetry.capture(),null);record('before_consent_zero_outbound');
  await telemetry.setConsent({enabled:true,policyVersion:POLICY_VERSION});
  const recommended=await service.recommend({taskId:analyzed.workflow.taskId,revisionId:analyzed.workflow.revisionId,intent:analyzed.intent});
  const identity={taskId:recommended.workflow.taskId,revisionId:recommended.workflow.revisionId};
  await service.selectPlan(identity);
  await service.feedback({...identity,outcome:'partial',note:'合成反馈："/Users/SYNTHETIC/Secret Folder/source.md" contact-synthetic@example.com；希望出处更清楚。',pluginIds:['local']});
  await telemetry.flush();let status=await telemetry.status();assert.equal(status.delivered,0);assert.equal(status.queued,4);record('upload_interrupted_queue_durable',{queued:status.queued});
  telemetry.close();service.close();
  start(true);telemetry.committed();status=await waitFor(s=>s.delivered===4&&s.queued===0,'automatic retry ACK');record('restart_automatically_retried_without_export',{delivered:status.delivered});
  const report=await query({command:'creator-report',plugin:'local',includeTest:true});
  assert.equal(report.candidateAppearances,1);assert.equal(report.modelRecommendations,1);assert.equal(report.userSelections,1);assert.equal(report.taskReportedOutcomes.partial,1);assert.equal(report.verifiedInstallations,0);assert.equal(report.verifiedTaskSuccesses,0);record('owner_central_aggregation',report);
  // intent_confirmed precedes discovery and has no plugin attribution yet.
  const cases=await query({command:'cases',includeTest:true,limit:100});
  const received=cases.cases.filter(row=>row.event.clientVersion===CLIENT_VERSION&&row.event.hostVersion==='synthetic-acceptance');assert.equal(received.length,4);
  const serialized=JSON.stringify(received);assert.ok(!serialized.includes('/Users/'));assert.ok(!serialized.includes('contact-synthetic@example.com'));assert.ok(!serialized.includes('原始私密目录'));assert.ok(received.every(row=>row.environment==='test'));record('central_cases_redacted_and_versioned',{events:received.map(row=>({type:row.event.type,plugins:row.event.data.plugins,feedback:row.event.data.feedback,task:row.event.data.task,plan:row.event.data.plan}))});
  const production=await query({command:'summary'});assert.equal(production.totalEvents,0);record('production_metrics_exclude_synthetic_data',{totalEvents:production.totalEvents});
  await telemetry.setConsent({enabled:false,policyVersion:POLICY_VERSION});const count=evidence.requests.length;
  await service.feedback({...identity,outcome:'blocked',note:'合成撤回后反馈，只存本机',pluginIds:['local']});await telemetry.flush();assert.equal(evidence.requests.length,count);record('stop_keeps_later_feedback_local_only');
  await telemetry.setConsent({enabled:true,policyVersion:POLICY_VERSION});await telemetry.flush();assert.equal(evidence.requests.length,count);assert.equal((await telemetry.status()).queued,0);record('reenable_does_not_backfill_old_records');
  await telemetry.requestDelete();telemetry.committed();status=await waitFor(s=>s.deleteConfirmed&&!s.deletionPending,'remote deletion acknowledgement');deleted=true;
  const after=await query({command:'creator-report',plugin:'local',includeTest:true});assert.equal(after.totalEvents,0);record('remote_delete_ack_and_central_readback',{deleteConfirmed:status.deleteConfirmed,totalEvents:after.totalEvents});
  evidence.passed=true;
 }finally{
  if(!deleted&&telemetry){try{await telemetry.requestDelete();await telemetry.flush();}catch{}}
  telemetry?.close();service?.close();
  if(savePath){await mkdir(resolve(savePath,'..'),{recursive:true});await writeFile(savePath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});}
 }
 return evidence;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=JSON.parse(await readFile(join(homedir(),'.config/dsh-plugin-finder/collector-admin.json'),'utf8'));
 smokeClient({config,savePath:process.argv[2]}).then(result=>console.log(JSON.stringify({passed:result.passed,steps:result.steps.map(s=>s.step),requestCount:result.requests.length}))).catch(()=>{console.error('Synthetic client acceptance failed. Inspect private evidence; no credential was printed.');process.exitCode=1;});
}
