import {communityCatalog} from './community-catalog-data.js';
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim();
const byId=new Map(communityCatalog.entries.map(entry=>[entry.id,entry]));
const categoryIds=new Set(communityCatalog.categories.map(category=>category.id));
const searchable=communityCatalog.entries.map(entry=>({entry,text:normalize([entry.name,entry.owner,entry.summary,entry.npmName,entry.sourceCategory,communityCatalog.categories.find(c=>c.id===entry.categoryId)?.label].filter(Boolean).join(' '))}));
const integer=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):fallback;};
export function getCommunityOverview(){
  const {entries,categories,...meta}=communityCatalog;
  return{...meta,categories:categories.map(category=>({...category,sourceCategories:[...category.sourceCategories],count:entries.filter(entry=>entry.categoryId===category.id).length,previews:entries.filter(entry=>entry.categoryId===category.id&&entry.preview)}))};
}
export function browseCommunity({categoryId='',query='',page=1,pageSize=24}={}){
  const size=integer(pageSize,24,1,60),tokens=normalize(String(query).slice(0,300)).split(/\s+/u).filter(Boolean).slice(0,12),category=typeof categoryId==='string'?categoryId:'';
  const rows=category&&!categoryIds.has(category)?[]:searchable.filter(({entry,text})=>(!category||entry.categoryId===category)&&tokens.every(token=>text.includes(token))).map(row=>row.entry);
  const total=rows.length,pages=Math.ceil(total/size),current=integer(page,1,1,Math.max(1,pages));
  return{entries:rows.slice((current-1)*size,current*size),total,page:current,pageSize:size,pages};
}
export function getCommunityEntry(id){return typeof id==='string'?byId.get(id)??null:null;}
