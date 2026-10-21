// Explicit manual public-service test. Never imported by npm test and never uses real history.
import assert from'node:assert/strict';
import{readFile,writeFile,mkdir,stat}from'node:fs/promises';
import{homedir}from'node:os';
import{join}from'node:path';
import{fileURLToPath}from'node:url';
import{randomBytes,randomUUID}from'node:crypto';
import{POLICY_VERSION}from'../src/telemetry-contract.js';
const file=join(homedir(),'.config/dsh-plugin-finder/collector-admin.json');
assert.equal((await stat(file)).mode&0o077,0,'private admin credential permissions');
const{endpoint,adminToken}=JSON.parse(await readFile(file,'utf8'));
const actions=[];let credentialsA,credentialsB;
async function call(path,{body,token,method=body?'POST':'GET',expected=200}={}){
 const r=await fetch(new URL(path,endpoint),{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{...body?{'content-type':'application/json'}:{},...token?{authorization:'Bearer '+token}:{}},...body?{body:JSON.stringify(body)}:{}});
 assert.equal(r.status,expected,'unexpected status for '+method+' '+path.split('?')[0]);return r.json();
}
async function registration(){return call('/v1/register',{body:{policyVersion:POLICY_VERSION,consentedAt:new Date().toISOString(),clientVersion:'0.2.3-synthetic',environment:'test'},expected:201});}
const pluginA={name:'dsh-synthetic-a-'+Date.now(),version:'1.0.0',commit:null,repository:'https://github.com/example/synthetic',sourceType:'unknown',modelSelected:true,userSelected:false,installationStatus:'unknown'};
const pluginB={...pluginA,name:pluginA.name.replace('-a-','-b-'),modelSelected:false};
const id=()=>randomBytes(32).toString('hex'),epochId=randomUUID(),taskId=id(),revisionId=id();
const event=(type,data)=>({schemaVersion:1,eventId:id(),epochId,taskId,revisionId,type,occurredAt:new Date().toISOString(),clientVersion:'0.2.3-synthetic',hostVersion:'0.2.1-rc.2',data});
const proof={endpoint,environment:'test',startedAt:new Date().toISOString(),actions};
try{
 assert.equal((await call('/health')).ok,true);actions.push('health');
 const baseline=await call('/admin/summary',{token:adminToken});
 await call('/admin/summary',{expected:401});actions.push('unauthorized_admin_rejected');
 credentialsA=await registration();credentialsB=await registration();actions.push('test_only_registrations');
 const events=[event('plan_generated',{task:{summary:'Synthetic: test@example.com /Users/synthetic/private.pdf api_key=sk-synthetic123456',capabilities:['本地检索'],constraints:[]},plugins:[pluginA,pluginB]}),event('plan_selected',{plugins:[{...pluginA,userSelected:true},pluginB]}),event('feedback_submitted',{plugins:[{...pluginA,userSelected:true}],feedback:{outcome:'complete',note:'Synthetic task outcome only',stage:'result',evidence:'user_reported'}})];
 for(let i=0;i<2;i++)assert.deepEqual((await call('/v1/events',{token:credentialsA.uploadToken,body:{schemaVersion:1,events}})).acceptedEventIds,events.map(x=>x.eventId));actions.push('upload_and_idempotent_replay');
 await call('/v1/events',{token:credentialsB.uploadToken,body:{schemaVersion:1,events:[events[0]]},expected:409});actions.push('cross_installation_conflict_rejected');
 await call('/admin/cases',{token:credentialsA.uploadToken,expected:401});actions.push('public_token_has_no_read_access');
 const production=await call('/admin/summary',{token:adminToken});assert.equal(production.totalEvents,baseline.totalEvents);actions.push('test_events_excluded_from_production');
 const report=async plugin=>call('/admin/creator-report?includeTest=1&plugin='+encodeURIComponent(plugin),{token:adminToken});
 const a=await report(pluginA.name),b=await report(pluginB.name);assert.equal(a.candidateAppearances,1);assert.equal(a.modelRecommendations,1);assert.equal(a.userSelections,1);assert.equal(b.candidateAppearances,1);assert.equal(b.modelRecommendations,0);assert.equal(b.userSelections,0);assert.equal(a.verifiedTaskSuccesses,0);proof.syntheticReport={a:{candidateAppearances:a.candidateAppearances,modelRecommendations:a.modelRecommendations,userSelections:a.userSelections,verifiedTaskSuccesses:a.verifiedTaskSuccesses},b:{candidateAppearances:b.candidateAppearances,modelRecommendations:b.modelRecommendations,userSelections:b.userSelections}};actions.push('creator_A_B_attribution_separated');
 const cases=await call('/admin/cases?includeTest=1&plugin='+pluginA.name,{token:adminToken});assert.equal(cases.cases.length,3);assert.doesNotMatch(JSON.stringify(cases),/test@example\.com|\/Users\/synthetic|sk-synthetic123456/);actions.push('server_sensitive_text_cleaned');
 assert.deepEqual(await call('/v1/installation',{token:credentialsA.deleteToken,method:'DELETE'}),{deleted:true});
 await call('/v1/events',{token:credentialsA.uploadToken,body:{schemaVersion:1,events:[event('intent_confirmed',{task:{summary:'Synthetic late upload',capabilities:[],constraints:[]}})]},expected:401});
 assert.deepEqual(await call('/v1/installation',{token:credentialsA.deleteToken,method:'DELETE'}),{deleted:true});actions.push('delete_idempotent_and_late_upload_revoked');
 assert.equal((await report(pluginA.name)).totalEvents,0);actions.push('deleted_events_absent_from_admin');
 proof.completedAt=new Date().toISOString();proof.ok=true;
}finally{
 for(const c of [credentialsA,credentialsB])if(c)try{await call('/v1/installation',{token:c.deleteToken,method:'DELETE'});}catch{actions.push('cleanup_requires_operator_review');}
 const folder=fileURLToPath(new URL('../../../output/plugin-finder-central-feedback-2026-10-20/',import.meta.url));const output=join(folder,'collector-synthetic-smoke-2026-10-20.json');await mkdir(folder,{recursive:true});await writeFile(output,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({ok:proof.ok===true,proof:output,actions},null,2));
}
