import {communityCatalog} from './community-catalog-data.js';

export const COMMUNITY_CATEGORIES=Object.freeze([
  Object.freeze({id:'work',label:'办公与工具',description:'处理文件、整理任务，让重复工作少一点。',sourceCategories:Object.freeze(['tools','workflow','notify'])}),
  Object.freeze({id:'content',label:'内容与输入',description:'读文档、看图表，用图片和语音表达。',sourceCategories:Object.freeze(['docs','vision','voice'])}),
  Object.freeze({id:'knowledge',label:'知识与助手',description:'留下有用记忆，找到适合自己的助手。',sourceCategories:Object.freeze(['memory','skill','identity','agi'])}),
  Object.freeze({id:'experience',label:'界面与趣味',description:'让日常使用更舒服，也添一点乐趣。',sourceCategories:Object.freeze(['ui','theme','fun'])}),
  Object.freeze({id:'develop',label:'开发与连接',description:'查看代码、操作网页，从其他设备接着做。',sourceCategories:Object.freeze(['dev','git','browser','remote','wsl'])}),
  Object.freeze({id:'manage',label:'模型与管理',description:'管理模型、会话、费用和权限。',sourceCategories:Object.freeze(['model','session','usage','security','market'])}),
]);

const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim();
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const integer=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):fallback;};
const shorten=value=>{const clean=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/gu,' ').trim(),chars=[...clean];return chars.length>240?chars.slice(0,239).join('')+'…':clean;};
const completeness=entry=>(entry.npmName&&entry.version?4:0)+(entry.summary.length>=30?2:0)+(entry.owner?1:0);

export function canonicalCommunityId(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash)throw Error('Catalog author source must be a plain HTTPS GitHub URL');
  const parts=u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
  if(parts.length<2||parts.some(p=>p==='.'||p==='..'||/%(?:2e|2f|5c)/i.test(p)))throw Error('Invalid GitHub catalog source');
  parts[0]=parts[0].toLowerCase();parts[1]=parts[1].replace(/\.git$/i,'').toLowerCase();
  return 'https://github.com/'+parts.join('/');
}

const freezeCatalog=catalog=>{
  if(!catalog||typeof catalog!=='object')return catalog;
  for(const entry of catalog.entries??[])if(entry&&typeof entry==='object')Object.freeze(entry);
  if(Array.isArray(catalog.entries))Object.freeze(catalog.entries);
  for(const cat of catalog.categories??[]){if(Array.isArray(cat?.sourceCategories))Object.freeze(cat.sourceCategories);if(cat&&typeof cat==='object')Object.freeze(cat);}
  if(Array.isArray(catalog.categories))Object.freeze(catalog.categories);
  return Object.freeze(catalog);
};

export function normalizeLiveCommunityCatalog(rawFull,{fetchedAt,baseCatalog=communityCatalog}={}){
  if(!rawFull||rawFull.name!=='awesome-dsh-plugin'||!Array.isArray(rawFull.plugins)||!rawFull.plugins.length||rawFull.plugins.length>50000){
    throw Error('Unsupported upstream catalog payload');
  }
  const categories=Array.isArray(baseCatalog?.categories)&&baseCatalog.categories.length?baseCatalog.categories:COMMUNITY_CATEGORIES;
  const categoryOf=new Map(categories.flatMap(category=>category.sourceCategories.map(source=>[source,category.id])));
  const previewMeta=new Map();
  let previewIndex=0;
  for(const entry of baseCatalog?.entries??[])if(entry?.preview)previewMeta.set(entry.id,{categoryId:entry.categoryId,summary:entry.summary,index:previewIndex++});

  const entries=[],seenIds=new Set();
  let excludedTotal=0,rejectedTotal=0;
  for(const row of rawFull.plugins){
    if(!row||typeof row!=='object'||typeof row.url!=='string'){rejectedTotal++;continue;}
    let id;
    try{id=canonicalCommunityId(row.url);}catch{rejectedTotal++;continue;}
    if(id.startsWith('https://github.com/piggy00544/')||/piggy00544/i.test(String(row.owner??''))||/piggy00544/i.test(String(row.npm??''))){
      excludedTotal++;continue;
    }
    if(seenIds.has(id))continue;
    seenIds.add(id);
    const categoryId=categoryOf.get(row.category)??'work';
    const chosen=previewMeta.get(id);
    const preview=Boolean(chosen&&chosen.categoryId===categoryId);
    const summaryText=preview?chosen.summary:typeof row.description==='string'?row.description:row.description?.zh??row.description?.en??'';
    entries.push(Object.freeze({
      id,
      name:shorten(row.name),
      owner:shorten(row.owner),
      summary:shorten(summaryText),
      sourceCategory:typeof row.category==='string'&&row.category?shorten(row.category):'tools',
      categoryId,
      repositoryUrl:row.url,
      npmName:typeof row.npm==='string'&&row.npm?row.npm:null,
      version:typeof row.version==='string'&&row.version?row.version:null,
      stars:Number.isFinite(row.stars)&&row.stars>=0?Math.floor(row.stars):null,
      sourceUrl:row.url,
      preview,
    }));
  }
  const minRequired=Math.floor((baseCatalog?.total??0)*0.5);
  if(!entries.length||entries.length<minRequired)throw Error('Incomplete upstream catalog snapshot');
  entries.sort((a,b)=>Number(b.preview)-Number(a.preview)||(a.preview&&b.preview?previewMeta.get(a.id).index-previewMeta.get(b.id).index:0)||completeness(b)-completeness(a)||cmp(a.name.toLowerCase(),b.name.toLowerCase())||cmp(a.id,b.id));
  const safeFetchedAt=typeof fetchedAt==='string'&&Number.isFinite(Date.parse(fetchedAt))?fetchedAt:new Date().toISOString();
  return freezeCatalog({
    schemaVersion:1,
    sourceUrl:baseCatalog.sourceUrl,
    sourceRepository:typeof rawFull.source==='string'?shorten(rawFull.source):baseCatalog.sourceRepository,
    sourceLicense:'CC0-1.0',
    fetchedAt:safeFetchedAt,
    sourceUpdatedAt:typeof rawFull.updated==='string'?rawFull.updated.slice(0,40):baseCatalog.sourceUpdatedAt,
    sourceTotal:rawFull.plugins.length,
    total:entries.length,
    excludedTotal,
    rejectedTotal,
    marketIndexTotal:baseCatalog.marketIndexTotal,
    categories,
    entries,
  });
}

let activeCatalog=communityCatalog;
let activeIndex=null;

function buildIndex(catalog){
  const labels=new Map(catalog.categories.map(category=>[category.id,category.label]));
  const byId=new Map(catalog.entries.map(entry=>[entry.id,entry]));
  const categoryIds=new Set(catalog.categories.map(category=>category.id));
  const searchable=catalog.entries.map(entry=>({
    entry,
    text:normalize([entry.name,entry.owner,entry.summary,entry.npmName,entry.sourceCategory,labels.get(entry.categoryId)].filter(Boolean).join(' ')),
  }));
  return {catalog,byId,categoryIds,searchable};
}
const getIndex=()=>{if(!activeIndex||activeIndex.catalog!==activeCatalog)activeIndex=buildIndex(activeCatalog);return activeIndex;};

export function getActiveCommunityCatalog(){return activeCatalog;}
export function setActiveCommunityCatalog(nextCatalog){
  if(!nextCatalog||typeof nextCatalog!=='object'||!Array.isArray(nextCatalog.entries)||!nextCatalog.entries.length||!Array.isArray(nextCatalog.categories)||!nextCatalog.categories.length){
    throw Error('Invalid community catalog');
  }
  activeCatalog=freezeCatalog(nextCatalog);
  activeIndex=null;
  return activeCatalog;
}
export function resetActiveCommunityCatalog(){
  activeCatalog=communityCatalog;
  activeIndex=null;
  return activeCatalog;
}

export function getCommunityOverview(){
  const {entries,categories,...meta}=activeCatalog;
  return{...meta,categories:categories.map(category=>({...category,sourceCategories:[...category.sourceCategories],count:entries.filter(entry=>entry.categoryId===category.id).length,previews:entries.filter(entry=>entry.categoryId===category.id&&entry.preview)}))};
}
export function browseCommunity({categoryId='',query='',page=1,pageSize=24}={}){
  const {categoryIds,searchable}=getIndex();
  const size=integer(pageSize,24,1,60),tokens=normalize(String(query).slice(0,300)).split(/\s+/u).filter(Boolean).slice(0,12),category=typeof categoryId==='string'?categoryId:'';
  const rows=category&&!categoryIds.has(category)?[]:searchable.filter(({entry,text})=>(!category||entry.categoryId===category)&&tokens.every(token=>text.includes(token))).map(row=>row.entry);
  const total=rows.length,pages=Math.ceil(total/size),current=integer(page,1,1,Math.max(1,pages));
  return{entries:rows.slice((current-1)*size,current*size),total,page:current,pageSize:size,pages};
}
export function getCommunityEntry(id){return typeof id==='string'?getIndex().byId.get(id)??null:null;}
