import {isAbsolute,win32} from 'node:path';

const PACKAGE='(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*';
const VERSION='[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
const packageName=new RegExp('^'+PACKAGE+'$');
const packageSpec=new RegExp('^(?:npm:)?('+PACKAGE+')(?:@('+VERSION+'))?$');
const version=new RegExp('^'+VERSION+'$');
const cleanString=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const localPath=value=>cleanString(value,2048)&&(isAbsolute(value)||win32.isAbsolute(value))?value:null;
const notes=[
  '这些事实仅来自当前 Host 的 profileContext 与 pluginManager.listBundles()，不代表其他 profile。',
  'installed 仅表示 profile 声明依赖；enabled 仅表示 profile 选中，不保证组件 active，也不代表插件功能已通过验收。',
  '缺失的 profile 或安装资料是未知；不得猜测 desktop、~/.dsh 或使用其他 Host 的安装状态。',
];

function optional(ctx,name){try{return ctx.get(name,false);}catch{return undefined;}}
function profileFacts(value){
  if(!value||!cleanString(value.name,120)||!/^[A-Za-z0-9._-]+$/u.test(value.name))return null;
  const dir=localPath(value.dir),dshHome=localPath(value.home);
  return dir&&dshHome?{name:value.name,dir,dshHome}:null;
}
function sourceFact(value){
  if(!cleanString(value,2000))return undefined;
  const npm=packageSpec.exec(value);if(npm)return npm[1]+(npm[2]?'@'+npm[2]:'');
  if(value.startsWith('file:')||localPath(value))return '[本机安装包]';
  try{
    const prefix=value.startsWith('git+')?'git+':'';
    const url=new URL(prefix?value.slice(4):value);
    if(!['https:','http:','ssh:'].includes(url.protocol))return undefined;
    url.username='';url.password='';url.search='';url.hash='';
    return prefix+url.href;
  }catch{return undefined;}
}
function bundleFacts(value){
  if(!value||!cleanString(value.name,214)||!packageName.test(value.name)||typeof value.installed!=='boolean'||typeof value.enabled!=='boolean'||!['installation','profile','missing'].includes(value.availability))return null;
  const source=sourceFact(value.source);
  return{name:value.name,...(cleanString(value.version,120)&&version.test(value.version)?{version:value.version}:{}),installed:value.installed,enabled:value.enabled,availability:value.availability,...(source?{source}:{})};
}
function selection({pluginIds,selectedPlugins}){
  if(Array.isArray(selectedPlugins)&&selectedPlugins.length){
    const names=selectedPlugins.map(item=>cleanString(item?.install?.spec,512)?packageSpec.exec(item.install.spec)?.[1]:undefined);
    if(names.every(Boolean))return new Set(names);
    return null;
  }
  if(Array.isArray(pluginIds)&&pluginIds.length&&pluginIds.every(name=>cleanString(name,214)&&packageName.test(name)))return new Set(pluginIds);
  return null;
}
async function readBounded(operation,signals,timeoutMs){
  if(signals.some(signal=>signal?.aborted))return null;
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;settled=true;clearTimeout(timer);
      for(const signal of signals)signal?.removeEventListener('abort',stop);
      resolve(value);
    };
    const stop=()=>finish(null),timer=setTimeout(stop,timeoutMs);
    for(const signal of signals)signal?.addEventListener('abort',stop,{once:true});
    Promise.resolve().then(operation).then(value=>finish({value}),()=>finish(null));
  });
}

/** Read a fresh, bounded whitelist from launcher-owned facts and the official manager; never inspect disk or credentials. */
export function createRuntimeContextReader(ctx,{signal:lifetime,timeoutMs=1500,maxPlugins=64}={}){
  const limit=Number.isInteger(maxPlugins)&&maxPlugins>0?Math.min(maxPlugins,128):64;
  const deadline=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,5000):1500;
  return async({pluginIds,selectedPlugins,signal}={})=>{
    const profile=profileFacts(optional(ctx,'profileContext'));
    const manager=optional(ctx,'pluginManager'),wanted=selection({pluginIds,selectedPlugins});
    const result=typeof manager?.listBundles==='function'?await readBounded(()=>manager.listBundles(),[signal,lifetime],deadline):null;
    const readable=Array.isArray(result?.value);
    const plugins=[];let complete=readable;
    if(readable)for(const row of result.value){
      const item=bundleFacts(row);
      if(!item){complete=false;continue;}
      if(wanted?!wanted.has(item.name):!item.installed&&item.availability!=='installation')continue;
      if(plugins.length>=limit){complete=false;continue;}
      plugins.push(item);
    }
    return{
      status:profile&&readable&&complete?'available':profile||readable?'partial':'unknown',
      profile,plugins,pluginScope:wanted?'selected':'installed',matching:wanted?'exact-package':'unknown',pluginsComplete:complete,
      api:{service:'pluginManager',readMethods:['listBundles','listPlugins']},notes:[...notes],
    };
  };
}
