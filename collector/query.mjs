import{readFile,stat}from'node:fs/promises';
import{homedir}from'node:os';
import{join}from'node:path';
import{pathToFileURL}from'node:url';
export async function queryCollector({endpoint,adminToken,command='summary',plugin,includeTest=false,limit=25,fetchImpl=fetch}){
 const base=new URL(endpoint);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['summary','cases','creator-report'].includes(command)||typeof adminToken!=='string'||!adminToken)throw new TypeError('Invalid collector configuration');
 const url=new URL('/admin/'+command,base);if(plugin)url.searchParams.set('plugin',plugin);if(includeTest)url.searchParams.set('includeTest','1');if(command==='cases')url.searchParams.set('limit',String(limit));
 const response=await fetchImpl(url,{headers:{authorization:'Bearer '+adminToken},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Collector returned HTTP '+response.status);return response.json();
}
async function main(){
 const args=process.argv.slice(2),command=args.shift()??'summary';const options={command};let secretFile=join(homedir(),'.config/dsh-plugin-finder/collector-admin.json');
 while(args.length){const flag=args.shift();if(flag==='--include-test')options.includeTest=true;else if(flag==='--plugin')options.plugin=args.shift();else if(flag==='--limit')options.limit=Number(args.shift());else if(flag==='--secret-file')secretFile=args.shift();else throw new Error('Unknown option');}
 const metadata=await stat(secretFile);if((metadata.mode&0o077)!==0)throw new Error('Admin credential file must have mode 0600');
 const config=JSON.parse(await readFile(secretFile,'utf8'));console.log(JSON.stringify(await queryCollector({...config,...options}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Collector query failed. Check command, endpoint, private credential file and service availability. No credential was printed.');process.exitCode=1;});
