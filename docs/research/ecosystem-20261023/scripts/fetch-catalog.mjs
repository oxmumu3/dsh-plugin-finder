import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fetched=[];
for(const [name,url] of [['plugins.json','https://awesome-dsh-plugin.com/plugins.json'],['index.json','https://awesome-dsh-plugin.com/index.json'],['homepage.html','https://awesome-dsh-plugin.com/']]){
  const startedAt=new Date().toISOString();
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{Accept:name.endsWith('.json')?'application/json':'text/html','User-Agent':'DSH-Plugin-Finder-public-catalog-research/0.8'}});
    const body=Buffer.from(await response.arrayBuffer());
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(body.length>30_000_000)throw new Error('Snapshot exceeds 30 MB research limit');
    const sha256=createHash('sha256').update(body).digest('hex');
    const snapshot={name,url,finalUrl:response.url,startedAt,fetchedAt:new Date().toISOString(),status:response.status,bytes:body.length,sha256,headers:Object.fromEntries(['content-type','etag','last-modified','cache-control','date','content-encoding'].map(key=>[key,response.headers.get(key)]).filter(([,value])=>value!==null)),access:'Public unauthenticated HTTPS GET; no plugin code executed',licenseStatus:'Pending source license audit; public access is not redistribution permission'};
    await fs.writeFile(path.join(root,'data',name),body);fetched.push(snapshot);
    const parsed=name.endsWith('.json')?JSON.parse(body):null;
    console.log(JSON.stringify({...snapshot,shape:parsed?{type:Array.isArray(parsed)?'array':typeof parsed,keys:Object.keys(parsed).slice(0,25),plugins:Array.isArray(parsed.plugins)?parsed.plugins.length:null,entries:Array.isArray(parsed.entries)?parsed.entries.length:null}:undefined}));
  }catch(error){const snapshot={name,url,startedAt,failedAt:new Date().toISOString(),error:String(error.message)};fetched.push(snapshot);console.log(JSON.stringify(snapshot));}
}
await fs.writeFile(path.join(root,'data','fetch-manifest.json'),JSON.stringify({schemaVersion:1,sourceBoundary:'Third-party catalog snapshots, not official plugin review or installation evidence',fetched},null,2)+'\n');
