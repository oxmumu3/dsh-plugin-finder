import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscovery} from '../src/discovery.js';

const SHA='a'.repeat(40);
const intent={goal:'只读预览本地文档中的图表、公式和表格',capabilities:['读取并解析本地 Markdown','渲染 Mermaid 流程图','渲染数学公式','显示 Markdown 表格','在工作区内生成只读预览'],queries:['Markdown preview','Mermaid render','math formula render','local Markdown 预览']};
const focused=[
 ['dsh-mermaid-image-preview-fixture','Previewing Mermaid diagram images, rendered locally. 本地渲染预览。'],
 ['dsh-math-render-fixture','Render math formula in message bubbles with live preview. 渲染公式预览。'],
 ['dsh-markdown-preview-fixture','Render Markdown in chat. 渲染并显示预览。'],
 ['dsh-mermaid-preview-fixture','Render Mermaid in Markdown messages. 渲染图表。'],
 ['dsh-mermaid-render-fixture','Render Mermaid in chat with preview. 渲染预览。'],
 ['dsh-local-share-fixture','Local Markdown share with rendered preview. 本地渲染预览。'],
].map(([name,description])=>({name,description}));
const comprehensive={name:'dsh-notebook-workbench-fixture',description:'Native Markdown preview with Mermaid diagrams, math, tables and syntax highlighting; rendering bundled offline. 在原生文件预览中渲染 Mermaid 图表、公式与表格。'};

function fixture(entries){
 const byName=new Map(entries.map(entry=>[entry.name,entry]));
 const fetchImpl=async input=>{
  const url=String(input);
  if(url==='https://awesome-dsh-plugin.com/plugins.json')return new Response(JSON.stringify({name:'awesome-dsh-plugin',plugins:entries.map(entry=>({...entry,url:`https://github.com/fixture/${entry.name}`,npm:entry.name,version:'1.0.0'}))}));
  if(url==='https://awesome-dsh-plugin.com/index.json')return new Response(JSON.stringify({format:1,plugins:[]}));
  if(url.includes('/search/repositories?'))return new Response(JSON.stringify({total_count:0,items:[]}));
  const packageName=url.match(/^https:\/\/registry\.npmjs\.org\/([^/]+)\/1\.0\.0$/)?.[1];
  const entry=byName.get(packageName);
  if(entry)return new Response(JSON.stringify({name:entry.name,version:'1.0.0',description:entry.description,repository:{url:`https://github.com/fixture/${entry.name}`},gitHead:SHA,engines:{dsh:'>=0.2.0-rc.2 <0.3.0-0'},dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
  if(url.endsWith('/README.md'))return new Response('Read-only local tools. No additional API key required.');
  return new Response(null,{status:404});
 };
 return createDiscovery({fetchImpl});
}

test('multi-query supply coverage keeps a broadly useful author candidate in the bounded shortlist',async()=>{
 const discovery=fixture([...focused,comprehensive]);
 try{
  const result=await discovery.search({intent,hostVersion:'0.2.1-rc.2'});
  assert.ok(result.candidates.some(entry=>entry.name===comprehensive.name),'a comprehensive description should not lose all six slots to single-purpose package names');
  assert.equal(result.candidates.length,6);
  assert.equal(result.coverage.inspected,6,'ranking must not expand the existing author-read budget');
  assert.equal(result.candidates.find(entry=>entry.name===comprehensive.name).evidence.installation,'not-tested');
 }finally{discovery.close();}
});

test('query coverage cannot create matches for unrelated entries or promote unknown supply into verified capability',async()=>{
 const discovery=fixture([{name:'dsh-weather-fixture',description:'Local weather forecast and city temperatures.'}]);
 try{
  const result=await discovery.search({intent:{goal:'核对引文',queries:['bibliography citation'],capabilities:['文献引文核对']},hostVersion:'0.2.1-rc.2'});
  assert.equal(result.candidates.length,0);assert.equal(result.coverage.inspected,0);
 }finally{discovery.close();}
});

test('repeating or reordering equivalent query terms does not change shortlist order or scores',async()=>{
 const entries=[...focused,comprehensive];
 const run=async queries=>{const discovery=fixture(entries);try{return(await discovery.search({intent:{...intent,queries},hostVersion:'0.2.1-rc.2'})).candidates.map(entry=>[entry.name,entry.match.score]);}finally{discovery.close();}};
 const baseline=await run(intent.queries);
 assert.deepEqual(await run([...intent.queries,'preview Markdown','Markdown preview']),baseline);
});
