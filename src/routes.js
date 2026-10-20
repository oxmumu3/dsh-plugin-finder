import {FinderError} from './contracts.js';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
export function registerFinderRoutes(ctx,service){
  let closed=false;const disposers=[];
  const connection=ctx.get('connection');
  for(const [endpoint,method,action] of [['bootstrap','GET',()=>service.bootstrap()],['analyze','POST',body=>service.analyze(body)],['recommend','POST',body=>service.recommend(body)],['feedback','POST',body=>service.feedback(body)],['reset','POST',body=>service.reset(body)],['history','POST',body=>service.history(body)],['open','POST',body=>service.open(body)],['refine','POST',body=>service.refine(body)],['handoff','POST',body=>service.handoff(body)],['import','POST',body=>service.importBackup(body)],['export','POST',body=>service.exportTask(body)]]){
    const off=connection.fetch.register({path:`/api/plugin_finder/${endpoint}`,methods:[method],requestBody:'buffered',async fetch(request){
      if(closed)return reply({error:{code:'CLOSED',message:'插件已关闭，请重新打开。'}},503);
      if(request.method!==method)return reply({error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不支持。'}},405);
      if(new URL(request.url).search)return reply({error:{code:'INVALID_INPUT',message:'不支持查询参数。'}},400);
      let body={};
      if(method==='POST'){
        const bodyLimit=endpoint==='import'?8100000:32768;
        if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return reply({error:{code:'CONTENT_TYPE',message:'请发送 JSON 请求。'}},415);
        if(Number(request.headers.get('content-length'))>bodyLimit)return reply({error:{code:'BODY_TOO_LARGE',message: endpoint==='import'?'备份文件过大，请分任务导入。':'请求过长，请缩短。'}},413);
        const bytes=await request.arrayBuffer();if(bytes.byteLength>bodyLimit)return reply({error:{code:'BODY_TOO_LARGE',message:endpoint==='import'?'备份文件过大，请分任务导入。':'请求过长，请缩短。'}},413);
        try{body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply({error:{code:'INVALID_INPUT',message:'请求不是有效 JSON 对象。'}},400);}
      }
      try{return reply(await action({...body,signal:request.signal}));}catch(error){const safe=error instanceof FinderError?error:new FinderError('MODEL_REQUEST_FAILED');return reply({error:{code:safe.code,message:safe.message}},safe.status);}
    }});disposers.push(off);
  }
  const stop=()=>{if(closed)return;closed=true;for(const off of disposers)off();};
  ctx.effect(()=>stop);return stop;
}
