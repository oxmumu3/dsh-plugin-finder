/** Normalize the public full catalog as discovery data, never as executable install commands. */
const PACKAGE=/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i;
const VERSION=/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

export function safeRepositoryPath(value){
 if(typeof value!=='string'||!value||value.length>1000)throw new Error('Unsafe repository path');
 let path;try{path=decodeURIComponent(value.replace(/^\.\//,''));}catch{throw new Error('Unsafe repository path');}
 if(!path||/[\\%?#:\u0000-\u001f\u007f]/u.test(path)||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Unsafe repository path');
 return path;
}

export function repositoryOf(value){
 const raw=typeof value==='string'?value:value?.url;
 if(typeof raw!=='string')return null;
 const clean=raw.replace(/^git\+/,'').replace(/^github:/,'https://github.com/').replace(/\.git(?:#.*)?$/,'');
 const match=clean.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/(.*))?$/);
 if(!match||match[1].split('/').some(part=>part==='.'||part==='..'))return null;
 const result={name:match[1],url:`https://github.com/${match[1]}`,directory:''};
 const tail=(match[2]??'').replace(/\/$/,'');
 if(tail){
  if(!tail.startsWith('tree/'))return null;
  const path=safeRepositoryPath(tail.slice(5)),parts=path.split('/');
  if(parts.length<2)throw new Error('Repository tree URL has no package directory');
  result.ref=parts.shift();result.directory=parts.join('/');result.treeSegments=path.split('/');
 }
 if(typeof value?.directory==='string'&&value.directory)result.directory=safeRepositoryPath(value.directory);
 if(!tail&&typeof value?.ref==='string')result.ref=safeRepositoryPath(value.ref);
 if(!tail&&Array.isArray(value?.treeSegments))result.treeSegments=safeRepositoryPath(value.treeSegments.join('/')).split('/');
 return result;
}

export function fullCatalog(value){
 if(!value||value.name!=='awesome-dsh-plugin'||!Array.isArray(value.plugins)||value.plugins.length>50000)throw new Error('Unsupported full plugin catalog');
 const entries=[];let rejectedRows=0,npmTotal=0,githubOnlyTotal=0;
 for(const row of value.plugins){
  try{
   const repository=repositoryOf(row?.url);if(!repository)throw new Error('Missing supported repository');
   if(row.npm!=null&&row.npm!==''&&(typeof row.npm!=='string'||!PACKAGE.test(row.npm)))throw new Error('Invalid package name');
   const npm=typeof row.npm==='string'&&PACKAGE.test(row.npm)?row.npm:null;
   if(npm)npmTotal++;else githubOnlyTotal++;
   const name=npm??(typeof row.name==='string'&&PACKAGE.test(row.name)?row.name:repository.name.split('/').at(-1));
   const version=typeof row.version==='string'&&VERSION.test(row.version)?row.version:null;
   entries.push({name,title:`${repository.name}${repository.directory?'#'+repository.directory:''}`,description:row.description??'',repository,
    ...(npm?{expectedPackageName:npm}:{}),metadata:{category:row.category,keywords:[]},
    ...(npm&&version?{versions:[{version,source:{type:'npm'}}]}:{}),supplyKind:npm?'npm':'github-only'});
  }catch{rejectedRows++;}
 }
 return{entries,total:value.plugins.length,npmTotal,githubOnlyTotal,rejectedRows,updated:typeof value.updated==='string'?value.updated.slice(0,80):null};
}
