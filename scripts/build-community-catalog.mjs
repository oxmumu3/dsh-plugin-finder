import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),research=path.join(root,'docs/research/ecosystem-20261023');
const readJson=async name=>JSON.parse(await fs.readFile(path.join(research,'data',name),'utf8'));
export const COMMUNITY_CATEGORIES=[
  {id:'work',label:'办公与工具',description:'处理文件、整理任务，让重复工作少一点。',sourceCategories:['tools','workflow','notify']},
  {id:'content',label:'内容与输入',description:'读文档、看图表，用图片和语音表达。',sourceCategories:['docs','vision','voice']},
  {id:'knowledge',label:'知识与助手',description:'留下有用记忆，找到适合自己的助手。',sourceCategories:['memory','skill','identity','agi']},
  {id:'experience',label:'界面与趣味',description:'让日常使用更舒服，也添一点乐趣。',sourceCategories:['ui','theme','fun']},
  {id:'develop',label:'开发与连接',description:'查看代码、操作网页，从其他设备接着做。',sourceCategories:['dev','git','browser','remote','wsl']},
  {id:'manage',label:'模型与管理',description:'管理模型、会话、费用和权限。',sourceCategories:['model','session','usage','security','market']},
];
export function canonicalCommunityId(value){
  const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash)throw Error('Catalog author source must be a plain HTTPS GitHub URL');
  const parts=u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
  if(parts.length<2||parts.some(p=>p==='.'||p==='..'||/%(?:2e|2f|5c)/i.test(p)))throw Error('Invalid GitHub catalog source');
  parts[0]=parts[0].toLowerCase();parts[1]=parts[1].replace(/\.git$/i,'').toLowerCase();
  return 'https://github.com/'+parts.join('/'); // Keep monorepo path and ref case-sensitive.
}
const shorten=value=>{const clean=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/gu,' ').trim(),chars=[...clean];return chars.length>240?chars.slice(0,239).join('')+'…':clean;};
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function completeness(entry){return(entry.npmName&&entry.version?4:0)+(entry.summary.length>=30?2:0)+(entry.owner?1:0);}
export function buildCommunityCatalog({full,market,manifest,selection,evidence,identity}){
  const source=manifest.fetched.find(item=>item.name==='plugins.json'&&item.status===200);if(!source)throw Error('Missing captured source provenance');
  const categories=COMMUNITY_CATEGORIES,categoryOf=new Map(categories.flatMap(c=>c.sourceCategories.map(s=>[s,c.id]))),selected=new Map(selection.entries.map((item,index)=>[canonicalCommunityId(item.repositoryUrl),{...item,index}]));
  const reviewed=new Map(evidence.entries.filter(e=>e.evidence?.review==='purpose-matched'&&e.evidence?.sha256).map(e=>[canonicalCommunityId(e.repositoryUrl),e]));
  const oldIdentity=identity.entries.find(e=>e.fullName==='piggy00544/dsh-workproof'&&e.owner==='piggy00544'&&e.status===200),unmigrated=identity.entries.find(e=>e.url==='https://api.github.com/repos/oxmumu3/dsh-workproof'&&e.status===404);
  const unresolvedOwnIds=new Set(['https://github.com/piggy00544/dsh-workproof/tree/main/packages/dsh-delivery-receipts','https://github.com/piggy00544/dsh-workproof/tree/main/packages/dsh-evidence-ledger']);
  const entries=[],excluded=[];
  for(const row of full.plugins){
    const id=canonicalCommunityId(row.url);
    if(id.startsWith('https://github.com/piggy00544/')){if(!unresolvedOwnIds.has(id)||!oldIdentity||!unmigrated)throw Error('Own legacy namespace needs fresh explicit identity disposition');excluded.push({sourceId:id,reason:'own-legacy-namespace-pending-migration'});continue;}
    const categoryId=categoryOf.get(row.category);if(!categoryId)throw Error('Unmapped source category: '+row.category);
    const chosen=selected.get(id);if(chosen&&(!reviewed.has(id)||chosen.categoryId!==categoryId))throw Error('Preview requires matching reviewed author source: '+id);
    entries.push({id,name:shorten(row.name),owner:shorten(row.owner),summary:shorten(chosen?.summaryOverride??row.description?.zh??row.description?.en),sourceCategory:row.category,categoryId,repositoryUrl:row.url,npmName:typeof row.npm==='string'&&row.npm?row.npm:null,version:typeof row.version==='string'&&row.version?row.version:null,stars:Number.isFinite(row.stars)&&row.stars>=0?Math.floor(row.stars):null,sourceUrl:row.url,preview:Boolean(chosen)});
  }
  if(new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Duplicate canonical entry identity; investigate rather than silently dropping');
  for(const category of categories)if(entries.filter(e=>e.categoryId===category.id&&e.preview).length!==3)throw Error('Each category requires exactly three reviewed preview entries');
  entries.sort((a,b)=>Number(b.preview)-Number(a.preview)||(a.preview&&b.preview?selected.get(a.id).index-selected.get(b.id).index:0)||completeness(b)-completeness(a)||cmp(a.name.toLowerCase(),b.name.toLowerCase())||cmp(a.id,b.id));
  return{catalog:{schemaVersion:1,sourceUrl:source.url,sourceRepository:full.source,sourceLicense:'CC0-1.0',fetchedAt:source.fetchedAt,sourceUpdatedAt:full.updated,sourceTotal:full.plugins.length,total:entries.length,excludedTotal:excluded.length,marketIndexTotal:market.plugins.length,categories,entries},excluded};
}
export async function build(){
  const [full,market,manifest,selection,evidence,identity]=await Promise.all(['plugins.json','index.json','fetch-manifest.json','preview-selection.json','sample-source-evidence.json','own-identity-evidence.json'].map(readJson));
  const bytes=await fs.readFile(path.join(research,'data/plugins.json')),record=manifest.fetched.find(x=>x.name==='plugins.json');
  if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Captured catalog hash mismatch');
  const {catalog,excluded}=buildCommunityCatalog({full,market,manifest,selection,evidence,identity});
  const text='// Generated from the CC0 Awesome DSH catalog. Rebuild: node scripts/build-community-catalog.mjs\n// Author documentation and plugin code are not included. Metadata is not installation or quality verification.\nconst freeze=value=>{if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const communityCatalog=freeze('+JSON.stringify(catalog)+');\n';
  await fs.writeFile(path.join(root,'src/community-catalog-data.js'),text);
  await fs.writeFile(path.join(research,'data/production-catalog-receipt.json'),JSON.stringify({schemaVersion:1,sourceSha256:record.sha256,productionSha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text),sourceTotal:catalog.sourceTotal,total:catalog.total,excludedTotal:excluded.length,excluded,categories:catalog.categories.map(c=>({id:c.id,count:catalog.entries.filter(e=>e.categoryId===c.id).length,previewCount:catalog.entries.filter(e=>e.categoryId===c.id&&e.preview).length})),order:'Manual reviewed previews, then presence of npm+version and descriptive metadata, then name/id. Stars are not used.',scope:'Local read-only metadata; no network, model, installation or author code runs during browsing.'},null,2)+'\n');
  console.log(JSON.stringify({total:catalog.total,sourceTotal:catalog.sourceTotal,excludedTotal:excluded.length,bytes:Buffer.byteLength(text),categories:catalog.categories.map(c=>({id:c.id,count:catalog.entries.filter(e=>e.categoryId===c.id).length}))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
