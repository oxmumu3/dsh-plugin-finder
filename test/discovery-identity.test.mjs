import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscovery} from '../src/discovery.js';
import {createFinderService} from '../src/service.js';
import {browseCommunity} from '../src/community-catalog.js';

const INDEX='https://awesome-dsh-plugin.com/index.json';
const NAME='shared-taskboard';
const intent={goal:'整理任务看板',input:'本地任务',output:'可读回看板',constraints:[],capabilities:['任务看板'],queries:['taskboard']};
const entry=(owner,version,commit)=>({name:NAME,title:owner+'/'+NAME,description:'taskboard 任务看板',repository:{url:'https://github.com/'+owner+'/'+NAME},versions:[{version,source:{type:'git',url:'https://github.com/'+owner+'/'+NAME,commit},engines:{}}]});
const first=entry('fixture-first','1.0.0','a'.repeat(40));
const second=entry('fixture-second','2.0.0','b'.repeat(40));
const specification=row=>'git+'+row.repository.url+'.git#'+row.versions[0].source.commit;
function discoveryFixture(rows,{marketRows=[],documentation='taskboard 任务看板; No API key required.'}={}){
  const calls=[];
  const all=[...rows,...marketRows];
  const fetchImpl=async(input,options={})=>{
    const url=String(input);calls.push(url);
    if(url===INDEX)return new Response(JSON.stringify({format:1,title:'fixture',plugins:rows}));
    if(url.includes('/search/repositories?'))return new Response(JSON.stringify({total_count:0,items:[]}));
    if(url==='https://awesome-dsh-plugin.com/plugins.json')return new Response('',{status:404});
    const published=all.find(row=>row.versions[0].source.type==='npm'&&url==='https://registry.npmjs.org/'+row.name+'/'+row.versions[0].version);
    if(published)return new Response(JSON.stringify({name:published.name,version:published.versions[0].version,description:'taskboard 任务看板',repository:published.repository,dsh:{bundle:{patch:'cordis.patch.yml'}}}));
    const row=all.find(row=>url.startsWith('https://raw.githubusercontent.com/'+row.title+'/'+(row.versions[0].source.commit??'HEAD')+'/'));
    if(row){
      if(url.endsWith('/package.json'))return new Response(JSON.stringify({name:row.name,version:row.versions[0].version,description:'taskboard 任务看板',main:'index.js',repository:row.repository,dsh:{bundle:{patch:'cordis.patch.yml'}}}));
      if(url.endsWith('/cordis.patch.yml'))return new Response('- insert: []');
      if(url.endsWith('/index.js'))return new Response('');
      if(url.endsWith('/README.md'))return new Response(documentation);
    }
    return new Response('',{status:404});
  };
  const market=marketRows.length?{listIndexes:()=>[{url:'https://fixture.example/index.json'}],search:async()=>({total:marketRows.length,entries:marketRows})}:undefined;
  const discovery=createDiscovery({fetchImpl,market});
  return{discovery,calls,search:()=>discovery.search({intent,hostVersion:'0.2.1-rc.3'})};
}
test('different authors and versions receive distinct identities while preserving checked manifest package names',async()=>{
  const f=discoveryFixture([first,second]),result=await f.search();
  assert.equal(result.candidates.length,2);assert.equal(new Set(result.candidates.map(c=>c.id)).size,2);
  for(const candidate of result.candidates){assert.equal(candidate.name,NAME);assert.equal(candidate.install.packageName,NAME);assert.notEqual(candidate.id,NAME);assert.ok(candidate.id.length<=200);}
  assert.deepEqual(new Set(result.candidates.map(c=>c.install.spec)),new Set([specification(first),specification(second)]));
  f.discovery.close();
});
test('npm and Git authors of the same package remain distinct when their versions differ',async()=>{
  const npm={...first,versions:[{version:'0.9.1',source:{type:'npm'},engines:{}}]},git=entry('fixture-second','0.1.0','b'.repeat(40));
  const f=discoveryFixture([npm,git]),result=await f.search();
  assert.equal(result.candidates.length,2);assert.equal(new Set(result.candidates.map(c=>c.id)).size,2);
  assert.deepEqual(new Set(result.candidates.map(c=>c.install.spec)),new Set([NAME+'@0.9.1',specification(git)]));
  assert.ok(result.candidates.every(c=>c.install.packageName===NAME));f.discovery.close();
});
test('same-version authors remain separately selectable and source conflicts never combine their evidence',async()=>{
  const peer=entry('fixture-second','1.0.0','b'.repeat(40)),f=discoveryFixture([first,peer]),result=await f.search();
  assert.equal(result.candidates.length,2);assert.equal(new Set(result.candidates.map(c=>c.id)).size,2);
  for(const candidate of result.candidates){
    const own=candidate.install.spec,other=[specification(first),specification(peer)].find(spec=>spec!==own);
    assert.ok(candidate.evidence.sourceConflicts.some(item=>item.retainedSpec===own&&item.otherSpec===other));
    assert.equal(candidate.evidence.sources.filter(source=>source.kind==='manifest').length,1);
    assert.equal(candidate.sourceTags.length,1);assert.ok(candidate.limitations.some(note=>note.includes(own)&&note.includes(other)));
  }
  assert.ok(result.warnings.some(warning=>warning.includes('冲突')));assert.ok(result.warnings.every(warning=>!warning.includes('保留首项')));f.discovery.close();
});
test('two versions of one author retain exact commits and distinct identities',async()=>{
  const newer=entry('fixture-first','2.0.0','c'.repeat(40)),f=discoveryFixture([first,newer]),result=await f.search();
  assert.equal(result.candidates.length,2);assert.equal(new Set(result.candidates.map(c=>c.id)).size,2);
  assert.deepEqual(new Set(result.candidates.map(c=>c.install.spec)),new Set([specification(first),specification(newer)]));f.discovery.close();
});
test('collision identities do not depend on source ordering or README wording',async()=>{
  const a=discoveryFixture([first,second]),b=discoveryFixture([second,first],{documentation:'另一份 taskboard 作者说明，无运行断言。'});
  const bySource=result=>Object.fromEntries(result.candidates.map(candidate=>[candidate.install.spec,candidate.id]));
  assert.deepEqual(bySource(await a.search()),bySource(await b.search()));a.discovery.close();b.discovery.close();
});
test('long package names retain full manifest identity while collision ids stay within the history limit',async()=>{
  const name='shared-'+ 'x'.repeat(183),f=discoveryFixture([{...first,name},{...second,name}]),result=await f.search();
  assert.equal(result.candidates.length,2);assert.equal(new Set(result.candidates.map(c=>c.id)).size,2);
  assert.ok(result.candidates.every(c=>c.id.length<=200&&c.name===name&&c.install.packageName===name));f.discovery.close();
});
test('same immutable source is deduplicated while non-colliding legacy identity stays unchanged',async()=>{
  const f=discoveryFixture([first],{marketRows:[first]}),result=await f.search();
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].id,NAME);assert.equal(result.candidates[0].install.packageName,NAME);
  assert.equal(result.candidates[0].sourceTags.length,2);assert.equal(result.candidates[0].evidence.sourceConflicts,undefined);f.discovery.close();
});

function memory(){const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};return{rows,store:{read:async id=>structuredClone(rows.get(id)),write:async row=>rows.set(row.id,structuredClone(row)),list:async()=>structuredClone([...rows.values()]),readPointer:async()=>structuredClone(pointer),writePointer:async value=>{pointer=structuredClone(value);}}};}
function modelFor(target){return{status:()=>({configured:true}),async call({data}){
  if(!data.intent)return{text:JSON.stringify(intent)};
  const [,repository,commit]=/^git\+https:\/\/github\.com\/(.+)\.git#([a-f0-9]{40})$/.exec(target);
  const chosen=data.candidates.find(candidate=>candidate.documentation?.url.startsWith('https://raw.githubusercontent.com/'+repository+'/'+commit+'/'));assert.ok(chosen);
  return{text:JSON.stringify({kind:'single',title:'所选作者方案',rationale:'作者声明支持，实际效果未验证',pluginIds:[chosen.id],steps:[{capability:intent.capabilities[0],owner:chosen.id,sourceCapability:chosen.capabilities[0],action:'处理本地任务',input:intent.input,output:intent.output}],limits:['尚未执行']})};
}};}
async function plan(core){const a=await core.analyze({request:'整理任务看板'});return core.recommend({taskId:a.workflow.taskId,revisionId:a.workflow.revisionId,intent:a.intent});}
test('real Core persists, reloads and exports exact selected source after an identity collision without migrating old tasks',async()=>{
  const saved=memory(),single=discoveryFixture([first]);
  const old=createFinderService({historyStore:saved.store,discovery:single.discovery,model:modelFor(specification(first)),hostVersion:'0.2.1-rc.3'}),original=await plan(old);
  const priorBytes=saved.rows.get(original.workflow.taskId).serialized;
  const both=discoveryFixture([first,second]),core=createFinderService({historyStore:saved.store,discovery:both.discovery,model:modelFor(specification(second)),hostVersion:'0.2.1-rc.3'});
  const result=await plan(core),selected=result.workflow.candidates.find(candidate=>result.workflow.plan.pluginIds.includes(candidate.id));
  assert.equal(selected.install.spec,specification(second));assert.equal(selected.install.packageName,NAME);assert.equal(new Set(result.workflow.candidates.map(c=>c.id)).size,2);
  const reloaded=createFinderService({historyStore:saved.store,model:{status:()=>({configured:true}),call:async()=>{throw Error('reload must not call model');}}});
  const opened=await reloaded.open({taskId:result.workflow.taskId,revisionId:result.workflow.revisionId});
  assert.equal(opened.workflow.candidates.find(c=>opened.workflow.plan.pluginIds.includes(c.id)).install.spec,specification(second));
  const backup=await reloaded.exportTask({taskId:result.workflow.taskId}),restored=memory();
  const recipient=createFinderService({historyStore:restored.store,model:{status:()=>({configured:true})}});
  await recipient.importBackup({workflow:backup});const imported=await recipient.open({taskId:backup.task.id,revisionId:backup.task.revisions.at(-1).id});
  assert.equal(imported.workflow.candidates.find(c=>imported.workflow.plan.pluginIds.includes(c.id)).install.spec,specification(second));
  assert.equal(saved.rows.get(original.workflow.taskId).serialized,priorBytes);assert.equal(JSON.parse(priorBytes).revisions.at(-1).workflow.candidates[0].id,NAME);
  single.discovery.close();both.discovery.close();
});
test('selected community author is checked directly and retains its exact source without a general search substitution',async()=>{
  const selected=browseCommunity({pageSize:60}).entries.find(item=>item.npmName&&item.version&&item.sourceUrl===item.repositoryUrl&&!item.sourceUrl.includes('/tree/'));assert.ok(selected);
  const repository=selected.repositoryUrl.replace('https://github.com/',''),sha='e'.repeat(40),calls=[];
  const manifest={name:selected.npmName,version:selected.version,description:'selected author taskboard',repository:{url:selected.repositoryUrl},gitHead:sha,dsh:{bundle:{patch:'cordis.patch.yml'}}};
  const discovery=createDiscovery({fetchImpl:async input=>{const url=String(input);calls.push(url);
    if(url==='https://api.github.com/repos/'+repository)return new Response(JSON.stringify({full_name:repository}));
    if(url==='https://registry.npmjs.org/'+selected.npmName+'/'+selected.version||url==='https://raw.githubusercontent.com/'+repository+'/'+sha+'/package.json')return new Response(JSON.stringify(manifest));
    if(url.endsWith('/README.md'))return new Response('Only the selected author. No API key required.');
    return new Response('',{status:404});
  }});
  const result=await discovery.searchSelected({communityEntryId:selected.id,hostVersion:'0.2.1-rc.3'});
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].id,selected.npmName);assert.equal(result.candidates[0].communityEntryId,selected.id);assert.equal(result.candidates[0].install.packageName,selected.npmName);
  assert.equal(result.candidates[0].install.spec,selected.npmName+'@'+selected.version);assert.equal(calls.some(url=>url.includes('/search/repositories?')||url===INDEX),false);discovery.close();
});
