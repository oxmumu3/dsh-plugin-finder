import {realpath} from 'node:fs/promises';
import {isAbsolute,relative,sep} from 'node:path';
import {runAgentCreation,observeAgentCreation} from './agent-creator.js';
import {AgentFinderError} from './agent-finder-service.js';

const names=['finder_lookup','finder_activate','finder_create','finder_status','finder_search'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const error=code=>Object.assign(new Error(code==='INVALID_INPUT'?'请求格式或大小不符合要求，未执行。':'无法确认当前主会话和工作区，未执行。'),{code});
const clean=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
function input(value,keys) {
  if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error('INVALID_INPUT');
  return value;
}
function list(value,max=24) {
  if(value===undefined)return[];
  if(!Array.isArray(value)||value.length>max||value.some(item=>!clean(item,350)))throw error('INVALID_INPUT');
  return value;
}
function requestInput(args,creation=false) {
  input(args,creation?['requestId','answers','feedback']:['requestId']);
  if(!clean(args.requestId,200))throw error('INVALID_INPUT');
  const request={requestId:args.requestId};
  if(creation&&args.feedback!==undefined){if(!clean(args.feedback,3000))throw error('INVALID_INPUT');request.feedback=args.feedback;}
  if(!creation||args.answers===undefined)return request;
  try{
    if(!Array.isArray(args.answers)||args.answers.length>3)throw error('INVALID_INPUT');
    const seen=new Set();
    const answers=args.answers.map(answer=>{
      input(answer,['id','answer']);
      if(!clean(answer.id,200)||!clean(answer.answer,2000)||seen.has(answer.id.trim()))throw error('INVALID_INPUT');
      seen.add(answer.id.trim());return{id:answer.id,answer:answer.answer};
    });
    return{...request,answers};
  }catch{throw new AgentFinderError('AGENT_CREATION_ANSWERS_INVALID',args.requestId);}
}

/** Derive a caller from a real runtime Session and a unique registered current workspace. */
export async function deriveAgentCaller(ctx,exec) {
  const agent=exec?.agent,session=agent?.session;
  if(!clean(agent?.id,200)||!session||session.id!==agent.id||!ctx.workspaceRegistry||!ctx.workingDirectory)throw error('AGENT_CALLER_INVALID');
  const cwd=ctx.workingDirectory.get(session);
  if(typeof cwd!=='string'||!isAbsolute(cwd))throw error('AGENT_CALLER_INVALID');
  try {
    const currentDirectory=await realpath(cwd),rows=ctx.workspaceRegistry.list();
    if(!Array.isArray(rows))throw error('AGENT_CALLER_INVALID');
    const memberships=rows.filter(row=>Array.isArray(row.sessionIds)&&row.sessionIds.includes(agent.id));
    if(memberships.length>1)throw error('AGENT_CALLER_INVALID');
    const workspace=memberships[0]??await ctx.workspaceRegistry.resolveByPath(currentDirectory);
    if(!workspace||!clean(workspace.id,200)||typeof workspace.path!=='string')throw error('AGENT_CALLER_INVALID');
    const directory=await realpath(workspace.path),local=relative(directory,currentDirectory);
    if(local==='..'||local.startsWith('..'+sep)||isAbsolute(local))throw error('AGENT_CALLER_INVALID');
    const samePath=rows.filter(row=>row.path===workspace.path);
    if(samePath.length!==1||samePath[0].id!==workspace.id)throw error('AGENT_CALLER_INVALID');
    return{sessionId:agent.id,workspaceId:workspace.id,directory};
  } catch {throw error('AGENT_CALLER_INVALID');}
}

/** Register the four Agent entry tools and scoped task routing through official registry effects. */
export function registerAgentTools(ctx,service,{defineTool,approveEscalation,signal}={}) {
  if(typeof defineTool!=='function'||typeof approveEscalation!=='function'||typeof ctx.tools?.register!=='function')throw error('AGENT_CALLER_INVALID');
  let closed=false,shutdown;
  const disposers=[],active=new Set(),lifetime=new AbortController();
  const cleanup=()=>{
    if(shutdown)return shutdown;
    closed=true;lifetime.abort();
    const failures=[];
    for(const dispose of disposers.splice(0).reverse())try{dispose();}catch(cause){failures.push(cause);}
    // Published Creator activations own asynchronous disposal and durable settlement.
    // Keep the storage owner waiting until every entered invocation has released that work.
    shutdown=Promise.allSettled([...active]).then(()=>{if(failures.length)throw new AggregateError(failures,'Finder Agent registration cleanup failed');});
    return shutdown;
  };
  const invocation=async exec=>{
    if(closed)throw error('AGENT_CALLER_INVALID');
    const control=AbortSignal.any([exec.signal,lifetime.signal,...signal?[signal]:[]]);
    control.throwIfAborted();
    return{caller:await deriveAgentCaller(ctx,exec),signal:control};
  };
  const definition=(name,description,parameters,execute,title)=>defineTool({name,description,parameters,
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    execute:(args,exec)=>{
      const pending=Promise.resolve().then(()=>{if(closed)throw error('AGENT_CALLER_INVALID');return execute(args,exec);}).then(value=>JSON.stringify(value));
      active.add(pending);pending.then(()=>active.delete(pending),()=>active.delete(pending));
      return pending;
    },
    presentCall:args=>({card:'generic',title,kind:['finder_lookup','finder_search'].includes(name)?'search':'other',rawInput:args}),
  });
  try {
    const definitions=[
      definition(names[0],'需要可直接使用的 Harness 集成功能（持久面板、额外工具或跨插件工作流）且现有能力不足时，先 finder_lookup 查现成能力、组合或缺口。通用读写从零编程不等于已有集成能力；普通已有代码开发或纯读写计算直接完成，不查 Finder。材料/权限不足和临时故障不等于插件缺口。返回后按 nextTool 接续并完成原任务。',{
        goal:{type:'string',required:true,description:'有界任务目标与能力缺口，不转交私有会话。'},
        acceptance:{type:'string',required:true,description:'如何核对产出符合原任务。'},
        constraints:{type:'array',items:{type:'string'},description:'必须继承的用户限制。'},
        knownCapabilities:{type:'array',items:{type:'string'},description:'已具备能力及不足之处。'},
      },async(args,exec)=>{
        input(args,['goal','acceptance','constraints','knownCapabilities']);
        if(!clean(args.goal,6000)||!clean(args.acceptance,4000))throw error('INVALID_INPUT');
        const request={goal:args.goal,acceptance:args.acceptance,constraints:list(args.constraints),knownCapabilities:list(args.knownCapabilities)};
        const context=await invocation(exec);
        return service.find(request,context.caller,{callId:exec.callId,signal:context.signal});
      },'查找可用能力'),
      definition(names[1],'当 nextTool 指向 finder_activate，按原 requestId 受控安装并准备已核对能力（影响当前 profile 所有会话，遵守宿主审批）；不要自行运行安装 CLI 或手改 profile。ready 后回原会话使用并验收原任务。',{requestId:{type:'string',required:true}},async(args,exec)=>{
        const request=requestInput(args),context=await invocation(exec);
        const authorize=async()=>{
          const policy=ctx.sandboxPolicy.resolve({session:exec.agent.session});
          await approveEscalation({requestedMode:'danger-full-access',effectiveMode:policy.mode,subject:'Finder plugin installation',
            justification:'Finder 安装或启用插件会影响当前 profile 的所有会话；Host 插件代码在工作区沙箱外运行。'},
          {approver:ctx.get?.('approval'),agent:exec.agent,callId:exec.callId,toolName:names[1],signal:context.signal});
          context.signal.throwIfAborted();
          const current=await deriveAgentCaller(ctx,exec);
          if(JSON.stringify(current)!==JSON.stringify(context.caller))throw error('AGENT_CALLER_INVALID');
          return true;
        };
        const result=await service.activate(request,context.caller,{signal:context.signal,authorize});
        return{...result,availableTools:ctx.tools.schemas(exec.agent).map(tool=>tool.name)};
      },'准备方案能力'),
      definition(names[2],'先 finder_lookup；当 nextTool 指向 finder_create 时按原 requestId 在当前工作区生成并验证缺失能力。首次只传 requestId，拿到 creation.questions 后才补 answers（最多3项，逐字用已返回 id，不发明 id）。已完成未安装产物可凭调用方明确源码审查意见或已知失败回执带 feedback 修订（合计最多两次，不重派活跃或未知产物，不自动发布）。按返回 nextTool 继续。',{
        requestId:{type:'string',required:true},answers:{type:'array',description:'仅在返回 creation.questions 后补答；最多3项，逐字用已返回 id，不发明或重复 id。',items:{type:'object',additionalProperties:false,properties:{id:{type:'string',required:true},answer:{type:'string',required:true}}}},feedback:{type:'string',description:'对已完成未安装产物的调用方源码审查意见，或已知创建/安装失败回执，最多3000字。'},
      },async(args,exec)=>{
        const request=requestInput(args,true),context=await invocation(exec);
        return runAgentCreation(ctx,service,request,context.caller,exec,{signal:context.signal});
      },'创建缺失能力'),
      definition(names[3],'按原 requestId 回读本会话请求与创建进度，再按返回 nextTool 接续；不重复安装、创建或发送。',{requestId:{type:'string',required:true}},async(args,exec)=>{
        const request=requestInput(args),context=await invocation(exec);
        return observeAgentCreation(ctx,service,request,context.caller,exec,{signal:context.signal});
      },'查看方案进度'),
      definition(names[4],'只读检索公开插件来源（不调模型、不改工作区、不安装、不写历史）；仅返回作者自述与索引线索，不代表已核实可用。',{
        need:{type:'string',required:true,description:'要查找的能力或需求描述，1—6000字。'},
        limit:{type:'number',description:'最多返回1—6条候选，默认6条。'},
      },async(args,exec)=>{
        input(args,['need','limit']);
        if(!clean(args.need,6000))throw error('INVALID_INPUT');
        const limit=args.limit===undefined?6:args.limit;
        if(!Number.isInteger(limit)||limit<1||limit>6)throw error('INVALID_INPUT');
        const context=await invocation(exec);
        return service.searchOnly({need:args.need,limit},{signal:context.signal});
      },'检索候选'),
    ];
    for(const value of definitions)disposers.push(ctx.tools.register(value));
    disposers.push(ctx.systemPrompt.section({name:'finder:agent-routing',order:5000,text:({scope})=>{
      if(!ctx.tools.get(names[0],scope))return'';
      return '判断交付形态：用户需要可直接使用的 Harness 集成功能（持久面板、交互页面、额外工具或跨插件工作流）且现有能力不足时，先 finder_lookup 查现成能力与组合再决定是否新造；通用读写从零编程不等于已有集成能力。普通已有代码开发、纯读写计算直接完成，不查 Finder；缺材料、缺权限或临时故障不等于插件缺口。仅想先看候选可用只读 finder_search（不代表可用）。\n返回结果含 nextTool 时，严格按 nextTool.name 与 nextTool.arguments（含原 requestId）接续并沿用 callerInstruction：finder_activate 受控安装，finder_create 首次只传 requestId、拿到 creation.questions 后再按原 id 补答（不发明 id），审批拒绝不代表代码失败，未知状态用 finder_status 回读不重派。不得自行扫描 profile、读凭据、用安装 CLI 或手工改 profile 绕过受控流程；最终在原会话实际使用并验收原任务才结案。';
    }}));
    ctx.effect?.(()=>cleanup);
    return cleanup;
  } catch(cause){cleanup();throw cause;}
}
