import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {createDiscovery} from '../src/discovery.js';
import {getCommunityEntry} from '../src/community-catalog.js';

const selected=getCommunityEntry('https://github.com/yongfanbeta/dsh-pomodoro');
const monorepo=getCommunityEntry('https://github.com/ethanyoq/invoice-downloader/tree/main/plugins/dsh-invoice-downloader');
const intent={goal:'给任务安排专注时间',input:'当前任务',output:'专注计时和记录',constraints:[],capabilities:['专注计时'],queries:['timer']};
const candidate={id:selected.npmName,name:selected.npmName,summary:'专注计时',capabilities:['专注计时'],communityEntryId:selected.id,communitySourceUrl:selected.sourceUrl,install:{type:'npm',spec:selected.npmName+'@'+selected.version,version:selected.version}};
const plan={kind:'single',title:'使用所选番茄钟',rationale:'作者声明具备计时能力，尚待运行',pluginIds:[candidate.id],steps:[{capability:'专注计时',owner:candidate.id,sourceCapability:'专注计时',action:'安排计时',input:'任务',output:'计时记录'}],limits:[]};
const copy=value=>structuredClone(value);
const ids=workflow=>({taskId:workflow.taskId,revisionId:workflow.revisionId});
function persistence(){let pointer={activeTaskId:null,activeRevisionId:null};const rows=new Map();return{read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}};}
function fixture({store=persistence(),candidates=[candidate],status='checked',modelPlan=plan,broadCandidate=candidate,broadPlan=plan,creation}={}){
  const calls=[],searches=[];
  const service=createFinderService({historyStore:store,hostVersion:'0.2.1-rc.2',discovery:{search:async args=>{searches.push({kind:'broad',...args});return{candidates:[broadCandidate],sources:[{id:'test',status:'live'}]};},searchSelected:async args=>{searches.push({kind:'selected',...args});return{candidates:copy(candidates),sources:[{id:'selected',status:status==='checked'?'live':'failed'}],selected:{entryId:args.communityEntryId,status,reason:status==='checked'?'':'所选作者资料尚未查明'},warnings:[]};}},model:{status:()=>({configured:true}),call:async args=>{calls.push(args);const result=args.system.includes('CREATION_CONFIRM_SCHEMA')?{intent,blueprint:args.data.creation.blueprint}:args.system.includes('CREATION_SCHEMA')?creation:args.data.candidates?(args.data.selectedCommunityEntry?modelPlan:broadPlan):intent;return{text:JSON.stringify(result),model:{label:'fixture'}};}}});
  return{service,store,calls,searches};
}

test('selection is canonical server data, persisted through recommendations, refinements, reload and export/import',async()=>{
  const f=fixture();
  const a=await f.service.analyze({request:'我想使用所选番茄钟',communityEntryId:selected.id,selectedCommunityEntry:{name:'FORGED',sourceUrl:'https://evil.test'},summary:'FORGED'});
  assert.equal(a.workflow.communityEntryId,selected.id);assert.deepEqual(f.calls[0].data.selectedCommunityEntry,selected);assert.ok(!JSON.stringify(f.calls[0]).includes('FORGED'));
  const p=await f.service.recommend({...ids(a.workflow),intent:a.intent,communityEntryId:monorepo.id});
  assert.equal(f.searches[0].kind,'selected');assert.equal(f.searches[0].communityEntryId,selected.id);
  assert.equal(p.workflow.communityEntryId,selected.id);assert.deepEqual(p.plan.pluginIds,[candidate.id]);
  assert.deepEqual(f.calls[1].data.selectedCommunityEntry,selected);
  const claim=await f.service.executionClaim({...ids(p.workflow),kind:'use',workspaceId:'test-workspace'});
  assert.match(claim.attempt.prompt,/不得自动改装另一个同名插件/);assert.ok(claim.attempt.prompt.includes(selected.sourceUrl));
  const refined=await f.service.refine({...ids(p.workflow),feedback:'保留我的计时记录'});
  assert.equal(refined.workflow.communityEntryId,selected.id);assert.equal(f.calls[2].data.selectedCommunityEntry.id,selected.id);
  const restarted=fixture({store:f.store});const restored=await restarted.service.bootstrap();assert.equal(restored.workflow.communityEntryId,selected.id);
  await restarted.service.recommend({...ids(restored.workflow),intent:restored.workflow.intent});assert.equal(restarted.searches[0].kind,'selected');
  const backup=await restarted.service.exportTask({taskId:a.workflow.taskId}),imported=fixture();
  const receipt=await imported.service.importBackup({workflow:backup});
  const opened=await imported.service.open({taskId:receipt.importedTaskId});assert.equal(opened.workflow.communityEntryId,selected.id);
  assert.equal(f.searches.filter(row=>row.kind==='broad').length,0);
});

test('unknown selection and switching an established task fail before another model call',async()=>{
  const f=fixture();await assert.rejects(f.service.analyze({request:'使用它',communityEntryId:'https://github.com/unknown/nope'}),error=>error.code==='COMMUNITY_ENTRY_UNAVAILABLE');assert.equal(f.calls.length,0);
  const a=await f.service.analyze({request:'使用它',communityEntryId:selected.id});
  await assert.rejects(f.service.analyze({...ids(a.workflow),request:'换另一个',communityEntryId:monorepo.id}),error=>error.code==='COMMUNITY_SELECTION_CONFLICT');assert.equal(f.calls.length,1);
  await f.service.reset(ids(a.workflow));const ordinary=await f.service.analyze({request:'给我一个计时方案'});
  assert.equal(ordinary.workflow.communityEntryId,undefined);await f.service.recommend({...ids(ordinary.workflow),intent:ordinary.intent});assert.equal(f.searches.at(-1).kind,'broad');
});

test('unresolved or substituted discovery produces explicit gap without invoking recommendation or choosing another plugin',async()=>{
  for(const args of [{candidates:[],status:'unresolved'},{candidates:[{...candidate,communityEntryId:monorepo.id,communitySourceUrl:monorepo.sourceUrl}]}]){
    const f=fixture(args),a=await f.service.analyze({request:'使用所选',communityEntryId:selected.id});
    const p=await f.service.recommend({...ids(a.workflow),intent:a.intent});
    assert.equal(p.plan.kind,'gap');assert.deepEqual(p.plan.pluginIds,[]);assert.equal(p.workflow.communityEntryId,selected.id);assert.equal(f.calls.length,1);
    assert.match(p.plan.rationale,/没有改推荐其他插件/);
    await assert.rejects(f.service.executionClaim({...ids(p.workflow),kind:'use',workspaceId:'w'}));
  }
});

test('model cannot silently substitute a native route for the selected plugin',async()=>{
  const f=fixture({modelPlan:{...plan,kind:'native',pluginIds:[],steps:[{...plan.steps[0],owner:'dsh',sourceCapability:null}]}});
  const a=await f.service.analyze({request:'使用所选',communityEntryId:selected.id});
  await assert.rejects(f.service.recommend({...ids(a.workflow),intent:a.intent}),error=>error.code==='MODEL_INVALID_OUTPUT');
  assert.equal((await f.service.bootstrap()).workflow.stage,'understand');
});

test('import rejects wrong selected source and forged A association with B install spec before execution',async()=>{
  const f=fixture(),a=await f.service.analyze({request:'使用所选',communityEntryId:selected.id}),p=await f.service.recommend({...ids(a.workflow),intent:a.intent});
  const original=await f.service.exportTask({taskId:p.workflow.taskId});
  for(const altered of [
    {...candidate,communityEntryId:monorepo.id,communitySourceUrl:monorepo.sourceUrl},
    {...candidate,install:{...candidate.install,spec:'attacker-timer@1.0.0'}},
    {...candidate,install:{...candidate.install,registry:'https://evil.test'}},
  ]){
    const backup=copy(original);backup.task.revisions.at(-1).workflow.candidates=[altered];const imported=fixture();
    await assert.rejects(imported.service.importBackup({workflow:backup}),error=>error.code==='INVALID_BACKUP');
    const legacy={format:2,...copy(p.workflow),candidates:[altered]};
    await assert.rejects(imported.service.importBackup({workflow:legacy}),error=>error.code==='INVALID_BACKUP');
    assert.equal((await imported.service.bootstrap()).workflow,null);
  }
});

test('new imported selection execution checks the live exact install, while existing local attempt resumes without another check',async()=>{
  const f=fixture(),a=await f.service.analyze({request:'使用所选',communityEntryId:selected.id}),p=await f.service.recommend({...ids(a.workflow),intent:a.intent});
  const imported=fixture({candidates:[{...candidate,install:{...candidate.install,spec:'attacker-timer@1.0.0'}}]});
  const receipt=await imported.service.importBackup({workflow:await f.service.exportTask({taskId:p.workflow.taskId})});
  const opened=await imported.service.open({taskId:receipt.importedTaskId});
  await assert.rejects(imported.service.executionClaim({...ids(opened.workflow),kind:'use',workspaceId:'w'}),error=>error.code==='COMMUNITY_SOURCE_UNVERIFIED');
  assert.equal((await imported.service.bootstrap()).workflow.executions.length,0);
  const claimed=await f.service.executionClaim({...ids(p.workflow),kind:'use',workspaceId:'w'}),checks=f.searches.length;
  const resumed=await f.service.executionClaim({...ids(p.workflow),kind:'use',workspaceId:'w'});
  assert.equal(resumed.claim,'existing');assert.equal(resumed.attempt.requestId,claimed.attempt.requestId);assert.equal(f.searches.length,checks);
});

test('explicit creation retains selected ancestry but can use fresh broader supply and survive export/import',async()=>{
  const other={id:'other-timer',name:'other-timer',capabilities:['专注计时'],install:{type:'npm',spec:'other-timer@1.0.0',version:'1.0.0'}};
  const otherPlan={...plan,pluginIds:[other.id],steps:plan.steps.map(step=>({...step,owner:other.id}))};
  const creation={strategy:'new',reuseAssessment:'用户希望定制自己的计时界面',candidateDecisions:[],questions:[],assumptions:[],blueprint:{name:'我的计时器',purpose:'安排专注时间',workflow:'选择任务后计时',inputs:'任务',outputs:'计时记录',ui:'当前工作区面板',data:'本机记录',tools:'计时器',runtime:'宿主环境',scope:'当前工作区',acceptance:'计时开始、停止、复位可操作'}};
  const f=fixture({creation,broadCandidate:other,broadPlan:otherPlan}),a=await f.service.analyze({request:'使用所选',communityEntryId:selected.id}),p=await f.service.recommend({...ids(a.workflow),intent:a.intent});
  const started=await f.service.creationStart({...ids(p.workflow),trigger:'user-customization'}),ready=await f.service.creationUpdate({...ids(started.workflow),confirm:true});
  assert.equal(ready.workflow.communityEntryId,selected.id);assert.equal(ready.workflow.creation.status,'ready');assert.deepEqual(ready.workflow.plan.pluginIds,[other.id]);assert.equal(f.searches.at(-1).kind,'broad');
  const imported=fixture(),receipt=await imported.service.importBackup({workflow:await f.service.exportTask({taskId:p.workflow.taskId})}),opened=await imported.service.open({taskId:receipt.importedTaskId});
  const claim=await imported.service.executionClaim({...ids(opened.workflow),kind:'create',workspaceId:'w'});assert.equal(claim.claim,'acquired');assert.match(claim.attempt.prompt,/现在开始创建/);
});

const SHA='a'.repeat(40);
function authorFixture({entry=monorepo,manifestPatch={},authorPatch={},missingReadme=false,canonicalName}={}){
  const calls=[],url=new URL(entry.sourceUrl),parts=url.pathname.split('/').filter(Boolean),repo=parts.slice(0,2).join('/'),directory=parts.slice(4).join('/');
  const manifest={name:entry.npmName,version:entry.version,description:'专注计时',repository:{url:`git+https://github.com/${repo}.git`},gitHead:SHA,dsh:{bundle:{patch:'patch.yml'}},engines:{dsh:'>=0.2.1-rc.2',node:'>=22'},...manifestPatch};
  const fetchImpl=async (input,options={})=>{
    const url=String(input);calls.push({url,method:options.method??'GET'});
    if(url===`https://api.github.com/repos/${repo}`)return Response.json({full_name:canonicalName??repo});
    if(url===`https://registry.npmjs.org/${entry.npmName}/${entry.version}`)return Response.json(manifest);
    if(url===`https://api.github.com/repos/${repo}/commits/main`)return Response.json({sha:SHA});
    if(url.includes('/commits/'))return new Response(null,{status:404});
    if(url===`https://raw.githubusercontent.com/${repo}/${SHA}/${directory?directory+'/':''}package.json`)return Response.json({...manifest,...authorPatch});
    if(url===`https://raw.githubusercontent.com/${repo}/${SHA}/${directory?directory+'/':''}README.md`&&!missingReadme)return new Response('Author package documentation. No additional API key required.');
    return new Response(null,{status:404});
  };
  return{calls,fetchImpl,repo,directory};
}

test('exact author discovery bypasses broad search and retains monorepo package identity and README path',async()=>{
  const f=authorFixture(),discovery=createDiscovery({fetchImpl:f.fetchImpl}),args={communityEntryId:monorepo.id,hostVersion:'0.2.1-rc.2',nodeVersion:'22.22.0'},result=await discovery.searchSelected(args);
  assert.equal(result.selected.status,'checked');assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].communityEntryId,monorepo.id);assert.equal(result.candidates[0].communitySourceUrl,monorepo.sourceUrl);
  assert.match(result.candidates[0].documentation.url,/plugins\/dsh-invoice-downloader\/README.md$/);
  assert.ok(f.calls.every(call=>!call.url.includes('awesome-dsh-plugin.com')&&!call.url.includes('/search/')&&call.method==='GET'));
  assert.equal((await discovery.searchSelected(args)).sources[0].status,'cached');
});

test('different owner, sibling package, exact-version mismatch and incompatibility cannot become selected candidates',async()=>{
  for(const change of [{canonicalName:'other/repo'},{manifestPatch:{repository:{url:'https://github.com/other/repo'}}},{manifestPatch:{repository:{url:'https://github.com/EthanYoQ/Invoice-Downloader',directory:'plugins/sibling'}}},{authorPatch:{name:'sibling-plugin'}},{manifestPatch:{engines:{dsh:'>=99'}}}]){
    const f=authorFixture(change),result=await createDiscovery({fetchImpl:f.fetchImpl}).searchSelected({communityEntryId:monorepo.id,hostVersion:'0.2.1-rc.2',nodeVersion:'22.22.0'});
    assert.equal(result.candidates.length,0);assert.ok(['unresolved','incompatible'].includes(result.selected.status));assert.ok(result.warnings.length);
  }
});

test('npm author gitHead version drift is documented without falsely changing the exact published install identity',async()=>{
  const f=authorFixture({authorPatch:{version:'0.0.1'}}),result=await createDiscovery({fetchImpl:f.fetchImpl}).searchSelected({communityEntryId:monorepo.id,hostVersion:'0.2.1-rc.2',nodeVersion:'22.22.0'});
  assert.equal(result.selected.status,'checked');assert.equal(result.candidates[0].install.spec,`${monorepo.npmName}@${monorepo.version}`);
  assert.ok(result.warnings.some(w=>w.includes('版本 0.0.1')&&w.includes('未证明')));
  assert.ok(result.candidates[0].limitations.some(w=>w.includes('字节等价')));
  assert.ok(result.candidates[0].documentation.url.includes(SHA));
});

test('missing package README does not fall back to a monorepo root description; unknown ID triggers no fetch',async()=>{
  const f=authorFixture({missingReadme:true}),discovery=createDiscovery({fetchImpl:f.fetchImpl});
  const result=await discovery.searchSelected({communityEntryId:monorepo.id,hostVersion:'0.2.1-rc.2',nodeVersion:'22.22.0'});
  assert.equal(result.candidates[0].documentation.text,'');
  assert.ok(!f.calls.some(call=>call.url===`https://raw.githubusercontent.com/${f.repo}/${SHA}/README.md`));
  const before=f.calls.length;await assert.rejects(discovery.searchSelected({communityEntryId:'https://github.com/forged/plugin'}));assert.equal(f.calls.length,before);
});
