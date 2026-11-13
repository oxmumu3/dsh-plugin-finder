import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readCatalogArchive} from './catalog-archive.js';
import {getCommunityEntry} from './community-catalog.js';
import {featuredCatalog} from './featured-catalog.js';
import {safeFeaturedInstall} from './featured.js';
import {assessCompatibility} from '../catalog/index.mjs';
import {FinderError} from './contracts.js';

// One small enum instead of guessing from prose: a decided incompatibility is not a
// failed read, and the view must keep its reason even when the local inventory is unknown.
const incompatible=(kind,declared='',reason='')=>({status:'incompatible',kind,...(declared?{declared}:{}),...(reason?{reason}:{})});
const incompatibleError=(message,compatibility)=>{const error=Error(message);error.compatibility=compatibility;return error;};

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bounded=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
const list=value=>Array.isArray(value)?value.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,2000)):[];
const safeRelative=name=>typeof name==='string'&&!path.isAbsolute(name)&&!name.includes('\\')&&!name.split('/').some(x=>x==='..');
const packagePattern=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const allowedHosts=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','raw.githubusercontent.com']);
const publicArchive=/^https:\/\/github\.com\/oxmumu3\/[a-zA-Z0-9_.-]+\/releases\/download\/v?([0-9a-zA-Z.-]+)\/([a-zA-Z0-9_.-]+\.tgz)$/;
const selectedCandidateMatches=(entry,candidate)=>entry.npmName
 ?candidate?.name===entry.npmName&&candidate.id===entry.npmName&&candidate.install?.type==='npm'&&candidate.install.version===entry.version&&candidate.install.spec===`${entry.npmName}@${entry.version}`
 :candidate?.communityEntryId===entry.id&&candidate.communitySourceUrl===entry.sourceUrl;

/** Editorial changes open a fresh record without replacing historical receipts. */
export function catalogEntryRevision({collection,entryId}){
 const selected=collection==='community'?getCommunityEntry(entryId):collection==='featured'?featuredCatalog.find(entry=>entry.id===entryId):null;
 if(!selected)throw new FinderError('INVALID_INPUT');
 return hash(Buffer.from(JSON.stringify(selected)));
}

/** Launcher-owned profile cache, never an inferred ~/.dsh or a user workspace. */
export function catalogArchiveRoot(ctx){
 let profile;try{profile=ctx.get('profileContext',false);}catch{}
 return typeof profile?.home==='string'&&path.isAbsolute(profile.home)?path.join(profile.home,'cache','plugin-finder','catalog'):undefined;
}

async function readResponse(response,max){
 if(!response.ok||Number(response.headers.get('content-length'))>max)throw Error('source unavailable');
 const chunks=[];let size=0;
 if(!response.body)throw Error('empty source');
 for await(const chunk of response.body){size+=chunk.byteLength;if(size>max)throw Error('source too large');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
async function request(url,{fetchImpl,signal,max=1000000}){
 for(let redirects=0;redirects<5;redirects++){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!allowedHosts.has(parsed.hostname))throw Error('unsupported source');
  const response=await fetchImpl(parsed.href,{redirect:'manual',signal,headers:{Accept:'application/vnd.github+json','User-Agent':'DSH-Finder'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('bad redirect');url=new URL(location,url).href;continue;}
  return readResponse(response,max);
 }
 throw Error('too many redirects');
}

async function ensureCacheRoot(archiveRoot,archiveHome){
 if(!archiveHome||!path.isAbsolute(archiveHome))throw Error('cache home unavailable');
 const relative=path.relative(path.resolve(archiveHome),path.resolve(archiveRoot));
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('cache outside home');
 const home=await fs.realpath(archiveHome);let current=home;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  try{await fs.mkdir(current,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await fs.lstat(current);
  if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(current)!==current)throw Error('cache ancestor is not owned directory');
 }
 return current;
}

async function archiveCandidate(entry,{archiveRoot,archiveHome,fetchImpl,signal,hostVersion,nodeVersion,platform,now}){
 const install=safeFeaturedInstall(entry,now());
 if(!install||!archiveRoot||!path.isAbsolute(archiveRoot))throw Error('no verified public package');
 const match=publicArchive.exec(install.spec);
 if(!match||match[1].replace(/^v/,'')!==install.version)throw Error('unverified public source');
 const url=new URL(install.spec),parts=url.pathname.split('/'),repository=parts.slice(1,3).join('/'),tag=parts[5],filename=parts[6];
 const get=(url,max)=>request(url,{fetchImpl,signal,max});
 const metadata=JSON.parse((await get('https://api.github.com/repos/'+repository,250000)).toString());
 if(metadata.full_name!==repository||metadata.full_name.split('/')[0]!=='oxmumu3')throw Error('canonical owner mismatch');
 const release=JSON.parse((await get('https://api.github.com/repos/'+repository+'/releases/tags/'+encodeURIComponent(tag),1000000)).toString());
 const assets=Array.isArray(release.assets)?release.assets:[];
 const matches=assets.filter(asset=>asset.name===filename&&asset.browser_download_url===install.spec);
 if(release.tag_name!==tag||release.draft!==false||matches.length!==1)throw Error('release identity mismatch');
 let expected=/^sha256:([a-f0-9]{64})$/.exec(matches[0].digest??'')?.[1];
 if(!expected){
  const checksums=assets.filter(asset=>asset.name==='SHA256SUMS'&&asset.browser_download_url===install.spec.slice(0,install.spec.lastIndexOf('/')+1)+'SHA256SUMS');
  if(checksums.length!==1)throw Error('no asset integrity');
  const lines=(await get(checksums[0].browser_download_url,100000)).toString().split(/\r?\n/).map(line=>line.match(/^([a-f0-9]{64})\s+\*?(.+)$/)).filter(row=>row&&row[2]===filename);
  if(lines.length!==1)throw Error('no exact checksum');expected=lines[0][1];
 }
 const bytes=await get(install.spec,16*1024*1024);
 if(hash(bytes)!==expected||entry.install.sha256&&entry.install.sha256!==expected)throw Error('asset integrity mismatch');
 const files=readCatalogArchive(bytes);
 const root=await ensureCacheRoot(archiveRoot,archiveHome);
 const file=path.join(root,expected+'.tgz');
 try{const handle=await fs.open(file,'wx',0o400);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
 catch(error){if(error.code!=='EEXIST')throw error;const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||hash(await fs.readFile(file))!==expected)throw Error('cache conflict');}
 const manifestBytes=files.get('package.json');
 if(!manifestBytes||manifestBytes.length>256000)throw Error('manifest unavailable');
 const manifest=JSON.parse(manifestBytes.toString());
 if(!packagePattern.test(manifest.name??'')||!entry.components.includes(manifest.name)||manifest.version!==install.version||manifest.dsh?.manifestVersion!==undefined&&manifest.dsh.manifestVersion!==1)throw Error('package identity mismatch');
 const patch=manifest.dsh?.bundle?.patch;
 if(!safeRelative(patch)||!files.has(patch.replace(/^\.\//,'')))throw Error('package is not a published DSH bundle');
 const range=manifest.engines?.dsh??manifest.peerDependencies?.['@deepseek-ai/dsh-tools'];
 if(range&&assessCompatibility({compatibility:{dsh:range}},hostVersion).status==='incompatible')throw incompatibleError('incompatible host',incompatible('host',String(range)));
 if(manifest.engines?.node&&nodeVersion&&assessCompatibility({compatibility:{dsh:manifest.engines.node}},nodeVersion).status==='incompatible')throw incompatibleError('incompatible Node',incompatible('node',String(manifest.engines.node)));
 if(Array.isArray(manifest.os)&&platform&&(manifest.os.includes('!'+platform)||manifest.os.some(x=>!x.startsWith('!'))&&!manifest.os.includes(platform)))throw incompatibleError('incompatible platform',incompatible('platform',String(platform)));
 return {id:manifest.name,name:manifest.name,summary:bounded(manifest.description,2000),capabilities:[],requirements:{notes:entry.requirements},limitations:entry.limitations,
  install:{type:'archive',spec:'file:'+file,packageName:manifest.name,version:manifest.version,sha256:expected,publicSource:install.spec,readiness:'ready'},
  evidence:{metadata:'manifest-checked',sources:[{kind:'verified-featured-release',url:install.spec,sha256:expected}],fetchedAt:new Date(now()).toISOString()}};
}

/** One selected catalog identity; no intent, recommendation, model or workflow API. */
export function createCatalogDetailResolver({discovery,featured=featuredCatalog,hostVersion,nodeVersion,platform,archiveRoot,archiveHome,fetchImpl=globalThis.fetch,signal:lifetime,now=Date.now,onDiagnostic=()=>{}}={}){
 return async input=>{
  if(!input||Object.keys(input).some(key=>!['collection','entryId','signal'].includes(key))||!['community','featured'].includes(input.collection)||typeof input.entryId!=='string')throw new FinderError('INVALID_INPUT');
  const {collection,entryId}=input;
  const selected=collection==='community'?getCommunityEntry(entryId):featured.find(entry=>entry.id===entryId);
  if(!selected)throw new FinderError('INVALID_INPUT');
  const entry={collection,id:entryId,name:collection==='community'?selected.name:selected.components[0],title:collection==='community'?selected.name:selected.title,summary:selected.summary,description:'',author:collection==='community'?selected.owner:'牛村木木山',version:selected.version??'',sourceUrl:collection==='community'?selected.sourceUrl:selected.sourceUrls[0]??'',requirements:list(selected.requirements),limitations:list(selected.limitations)};
  let candidate=null,unavailableReason='',compatibility=null;
  const signal=AbortSignal.any([input.signal,lifetime,AbortSignal.timeout(45000)].filter(Boolean));
  try{
   if(collection==='featured'){
    if(selected.status!=='available')return{entry,candidate:null,compatibility:null,unavailableReason:selected.status==='private'?'此插件目前为私有接入，尚未提供公开安装版本。':'此插件目前为本地预览，尚未提供公开安装版本。'};
    // The pinned package's own engines.dsh is enough to stop before any download:
    // a known miss is "unsupported", never an unverified source that invites a retry.
    if(Array.isArray(selected.hosts)&&selected.hosts.length&&typeof hostVersion==='string'&&hostVersion&&!selected.hosts.includes(hostVersion))
      return{entry,candidate:null,compatibility:incompatible('host',selected.hosts.join(' || ')),unavailableReason:`目录里记的 ${selected.version} 版不支持你现在的 DSH。等作者更新后再装。`};
    candidate=await archiveCandidate(selected,{archiveRoot,archiveHome,fetchImpl,signal,hostVersion,nodeVersion,platform,now});
   }else{
    const value=await discovery.searchSelected({communityEntryId:entryId,hostVersion,nodeVersion,platform,signal});
    if(value?.candidates?.length!==1||value.candidates[0].evidence?.metadata!=='manifest-checked'||!selectedCandidateMatches(selected,value.candidates[0])){
     const reason=bounded(value?.selected?.reason);
     if(value?.selected?.status==='incompatible')compatibility=incompatible('runtime','',reason);
     unavailableReason=value?.selected?.status==='incompatible'?(reason&&!reason.includes('不能确认这条使用方案')?reason:'这个版本与当前宿主或运行环境不兼容，暂不能安装。')
      :'暂时无法核对这个插件的作者来源、精确版本或安装资料，请稍后重试。'+(reason&&!reason.includes('不能确认这条使用方案')?' '+reason:'');
    }
    else candidate=value.candidates[0];
   }
   if(candidate){
    entry.name=candidate.name||candidate.id;entry.version=candidate.install.version;
    entry.description=bounded(candidate.summary,3000);
    entry.requirements=[...new Set([...entry.requirements,...list(candidate.requirements?.notes),...list(candidate.requirements)])].slice(0,20);
    entry.limitations=[...new Set([...entry.limitations,...list(candidate.limitations)])].slice(0,20);
    if(candidate.hostCompatibility?.status==='incompatible'){compatibility=incompatible('host',String(candidate.hostCompatibility.range??''));candidate=null;unavailableReason=compatibility.declared?`这个版本要求 DSH ${compatibility.declared}，不支持你现在的 DSH。等作者更新后再装。`:'这个版本不支持你现在的 DSH。等作者更新后再装。';}
    else if(candidate.nodeCompatibility?.status==='incompatible'){compatibility=incompatible('node',String(candidate.nodeCompatibility.range??''));candidate=null;unavailableReason=`这个版本要求 Node ${compatibility.declared||'其他版本'}，你现在的是 ${nodeVersion||'当前版本'}。暂不能安装。`;}
    else if(candidate.install.readiness==='blocked'){compatibility=incompatible('runtime');candidate=null;unavailableReason='这个版本当前不满足宿主或运行环境要求，暂不能安装。';}
   }
  }catch(error){
   onDiagnostic({collection,entryId,message:bounded(error?.message,200)});
   if(input.signal?.aborted||lifetime?.aborted)throw new FinderError('MODEL_ABORTED');
   const failure=error?.message??'';
   const decided=error?.compatibility&&error.compatibility.status==='incompatible'?error.compatibility:null;
   if(decided)compatibility=decided;
   unavailableReason=decided?.kind==='host'&&collection==='featured'?`目录里记的 ${selected.version} 版不支持你现在的 DSH。等作者更新后再装。`
    :decided?.kind==='host'?(decided.declared?`这个版本要求 DSH ${decided.declared}，不支持你现在的 DSH。等作者更新后再装。`:'这个版本不支持你现在的 DSH。等作者更新后再装。')
    :decided?.kind==='node'?`这个版本要求 Node ${decided.declared||'其他版本'}，你现在的是 ${nodeVersion||'当前版本'}。暂不能安装。`
    :decided?.kind==='platform'?`这个版本的插件不支持 ${decided.declared||platform||'当前系统'}。暂不能安装。`
    :decided?`${decided.reason||'这个版本和当前环境不兼容。'} 暂不能安装。`
    :'暂时无法核对这个插件的精确版本、安装来源或兼容性，请稍后重试。';
  }
  return {entry,candidate,compatibility,unavailableReason};
 };
}
