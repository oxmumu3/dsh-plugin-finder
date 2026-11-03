import {featuredCatalog} from './featured-catalog.js';
import {getCommunityEntry} from './community-catalog.js';
import {repositoryOf,safeRepositoryPath} from './supply.js';
import {isBundleActive} from './plugin-installation.js';
import {FinderError} from './contracts.js';

const packagePattern=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const unavailable=()=>{throw new FinderError('PLUGIN_INSTALL_UNAVAILABLE');};
const absent=packageName=>({installed:false,enabled:false,active:false,conflict:false,packageName,version:'',componentOnly:false});
const componentName=value=>typeof value==='string'?value.match(/^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@|（|$)/)?.[1]:null;
// Canonical publisher identities were independently verified for these four
// products. This is local recognition only, never an interchangeable install spec.
const primaryAliases=Object.freeze({
 'dsh-agent-twin':'@oxmumu3/dsh-agent-twin',
 'dsh-family-assistant':'@oxmumu3/dsh-family-assistant',
 'dsh-project-companion':'@oxmumu3/dsh-project-companion',
 'dot-dsh-management':'@oxmumu3/dot-dsh-management',
});

// A recorded Git source can identify a local package even when its author used
// a mutable ref. It is never used as an install source or an authorization.
function githubSource(value){
 if(!text(value,3000))return null;
 try{
  const url=new URL(value.replace(/^git\+/,'').replace(/^github:/,'https://github.com/'));
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search)return null;
  const match=/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(url.pathname);
  if(!match||[match[1],match[2]].some(part=>part==='.'||part==='..'))return null;
  const ref=url.hash?/^#([A-Za-z0-9_./-]+)(?:&path:\/([A-Za-z0-9_./-]+))?$/.exec(url.hash):null;
  if(url.hash&&!ref)return null;
  const directory=ref?.[2]?safeRepositoryPath(ref[2]):'';
  return{repository:(match[1]+'/'+match[2].replace(/\.git$/,'')).toLowerCase(),directory};
 }catch{return null;}
}

function facts(bundle,plugins,componentOnly=false){
 if(!text(bundle?.name,214)||!packagePattern.test(bundle.name)||bundle.installed!==true||typeof bundle.enabled!=='boolean'||!text(bundle.version,120))unavailable();
 return{installed:true,enabled:bundle.enabled,active:isBundleActive(bundle,plugins),conflict:false,packageName:bundle.name,version:bundle.version,componentOnly};
}

/** Local installation facts do not depend on remote source availability.
 * Only trusted catalog identities enter this read-only path. No caller-provided
 * package names, filesystem paths, install specs, or mutation methods are used.
 */
export function createCatalogInventoryReader(ctx){
 return async input=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(key=>!['collection','entryId'].includes(key))||!['community','featured'].includes(input.collection)||!text(input.entryId,2048))throw new FinderError('INVALID_INPUT');
  const selected=input.collection==='featured'?featuredCatalog.find(entry=>entry.id===input.entryId):getCommunityEntry(input.entryId);
  if(!selected)throw new FinderError('INVALID_INPUT');
  let manager,bundles,plugins;
  try{
   manager=ctx.get('pluginManager',false);
   if(!manager||typeof manager.listBundles!=='function'||typeof manager.listPlugins!=='function')unavailable();
   [bundles,plugins]=await Promise.all([manager.listBundles(),manager.listPlugins()]);
   if(!Array.isArray(bundles)||!Array.isArray(plugins))unavailable();
  }catch{unavailable();}
  if(input.collection==='featured'||selected.npmName){
   const names=input.collection==='featured'?selected.components.map(componentName):[selected.npmName];
   if(!names.length||names.some(name=>!text(name,214)||!packagePattern.test(name)))unavailable();
   for(let index=0;index<names.length;index++){
    const variants=input.collection==='featured'&&index===0&&primaryAliases[names[index]]?[names[index],primaryAliases[names[index]]]:[names[index]];
    for(const name of variants){
     const matches=bundles.filter(bundle=>bundle?.name===name);
     if(matches.length>1)unavailable();
     if(matches[0]?.installed===true)return facts(matches[0],plugins,index>0);
    }
   }
   return absent(names[0]);
  }
  let repo;
  try{repo=repositoryOf(selected.sourceUrl);}catch{unavailable();}
  if(!repo)unavailable();
  const matches=bundles.filter(bundle=>{
   if(bundle?.installed!==true)return false;
   const source=githubSource(bundle.source);
   return source?.repository===repo.name.toLowerCase()&&source.directory===repo.directory;
  });
  if(matches.length>1)unavailable();
  if(matches.length===1)return facts(matches[0],plugins);
  // No manifest name is known for a Git-only card. Local/npm installations
  // cannot safely be ruled out or guessed from the card's display name.
  if(bundles.some(bundle=>bundle?.installed===true))unavailable();
  return absent('');
 };
}
