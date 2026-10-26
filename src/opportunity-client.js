const endpoint='/api/plugin_finder/';
const string=(value,max=6000)=>typeof value==='string'?value.slice(0,max):'';
const choices=value=>Array.isArray(value)?value:[];
const executing=state=>['preparing','running','waiting'].includes(state.execution?.phase);
export function createOpportunityClient({getState,publish,fetchRequest=globalThis.fetch,run,applyResult,preserve=()=>true,preferenceStore=globalThis.localStorage,onReveal=()=>{}}={}){
 let closed=false,sequence=0,pending=null,adopting=false;
 const stopKey='dsh.plugin-finder.opportunity-stop.v1';
 const stopped=()=>{try{return preferenceStore?.getItem(stopKey)==='stopped';}catch{return true;}};
 const rememberStop=stop=>{try{if(stop)preferenceStore?.setItem(stopKey,'stopped');else preferenceStore?.removeItem(stopKey);}catch{}};
 const patch=value=>{if(!closed)publish(value);};
 const abort=()=>{sequence++;pending?.controller.abort();pending=null;patch({opportunityBusy:''});};
 const apply=value=>{if(value&&typeof value==='object'&&value.consent&&Array.isArray(value.opportunities))patch({opportunity:stopped()&&value.consent.enabled?{...value,consent:{...value.consent,enabled:false},opportunities:[],status:'idle'}:value});};
 async function call(path,body,onValue,{replace=false}={}){
  if(closed||pending&&!replace)return false;
  if(replace)abort();
  const id=++sequence,controller=new AbortController();pending={id,controller,path};
  patch({opportunityBusy:path,opportunityError:''});
  const timer=setTimeout(()=>controller.abort('timeout'),125000);
  try{
   const response=await fetchRequest(endpoint+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
   if(closed||id!==sequence||controller.signal.aborted)return false;
   const value=await response.json();
   if(closed||id!==sequence||controller.signal.aborted)return false;
   if(!response.ok)throw Object.assign(new Error(string(value?.error?.message,600)||'这次机会查找没有完成，可以保留资料后重试。'),{safe:true});
   onValue(value);return true;
  }catch(error){if(!closed&&id===sequence)patch({opportunityError:error.safe?error.message:controller.signal.aborted?'已停止本次机会查找，原资料和方案保留。':'暂时未能读取机会状态，请稍后重试。'});return false;}
  finally{clearTimeout(timer);if(pending?.id===id){pending=null;patch({opportunityBusy:''});}}
 }
 const draft=()=>getState().opportunityDraft||{historyTaskIds:[],workspaceId:getState().workspaceId||'',paths:[]};
 const edit=change=>patch({opportunityDraft:{...draft(),...change},opportunityError:''});
 async function metadata(workspaceId){
  if(!workspaceId)return false;
  return call('opportunity-context',{workspaceId},value=>patch({opportunityFiles:choices(value.files).filter(f=>typeof f?.path==='string'),opportunityFilesTruncated:value.truncated===true}));
 }
 const methods={
  async openOpportunitySettings(){
   const state=getState(),consent=state.opportunity?.consent||{};
   patch({opportunityEditing:true,opportunityError:'',opportunityDraft:{historyTaskIds:[...choices(consent.historyTaskIds)],workspaceId:consent.workspace?.workspaceId||state.workspaceId||'',paths:[...choices(consent.workspace?.paths)]},opportunityFiles:[]});
   return metadata(draft().workspaceId);
  },
  closeOpportunitySettings(){if(pending?.path==='opportunity-context')abort();patch({opportunityEditing:false});},
  async setOpportunityWorkspace(workspaceId){if(pending)abort();edit({workspaceId:string(workspaceId,200),paths:[]});patch({opportunityFiles:[]});return metadata(workspaceId);},
  setOpportunityHistoryTask(taskId,selected){
   if(!choices(getState().opportunity?.historyChoices).some(c=>c.taskId===taskId))return;
   const ids=new Set(draft().historyTaskIds);selected?ids.add(taskId):ids.delete(taskId);
   if(ids.size>8){patch({opportunityError:'一次最多选择8份方案。'});return;}edit({historyTaskIds:[...ids]});
  },
  toggleOpportunityFile(path){
   const paths=new Set(draft().paths);paths.has(path)?paths.delete(path):paths.add(path);
   if(paths.size>8){patch({opportunityError:'一次最多选择8个文本文件。'});return;}edit({paths:[...paths]});
  },
  setOpportunityPaths(value){
   const paths=[...new Set(string(value,12000).split('\n').map(s=>s.trim()).filter(Boolean))];
   if(paths.length>8){patch({opportunityError:'一次最多选择8个文件，请保留最相关的材料。'});return;}edit({paths});
  },
  async saveOpportunityScope(){
   if(closed||pending||getState().busy)return false;
   const scope=draft(),historyTaskIds=scope.historyTaskIds||[],paths=scope.paths||[];
   if(!historyTaskIds.length&&!paths.length){patch({opportunityError:'先选一份方案或材料，模型才知道参考什么。'});return false;}
   if(paths.length&&!scope.workspaceId){patch({opportunityError:'请先选择材料所属的工作区。'});return false;}
   const ok=await call('opportunity-grant',{enabled:true,historyTaskIds,...(paths.length?{workspace:{workspaceId:scope.workspaceId,paths}}:{})},value=>{rememberStop(false);apply(value.opportunity);patch({opportunityEditing:false,opportunityAdoption:null});onReveal();});
   return ok?methods.discoverOpportunities():false;
  },
  async discoverOpportunities(force=false){
   const state=getState();if(closed||!state.opportunity?.consent?.enabled||state.busy||executing(state))return false;
   const epoch=state.opportunity.consent.epoch;
   return call('opportunity-discover',force?{force:true}:{},value=>{if(getState().opportunity?.consent?.epoch===epoch)apply(value.opportunity);});
  },
  async disableOpportunities(){
   if(closed)return false;
   rememberStop(true);const prior=getState().opportunity;if(prior)patch({opportunity:{...prior,consent:{...prior.consent,enabled:false},opportunities:[],status:'idle'}});
   return call('opportunity-grant',{enabled:false,historyTaskIds:[]},value=>{apply(value.opportunity);patch({opportunityEditing:false,opportunityAdoption:null});},{replace:true});
  },
  async feedbackOpportunity(opportunityId,feedback){
   if(!['irrelevant','known','later','helpful'].includes(feedback)||!choices(getState().opportunity?.opportunities).some(o=>o.id===opportunityId))return false;
   return call('opportunity-feedback',{opportunityId,feedback},value=>apply(value.opportunity));
  },
  async restoreOpportunityFeedback(){const op=getState().opportunity;if(!op?.consent?.enabled)return false;return call('opportunity-feedback',{feedback:'restore',epoch:op.consent.epoch},value=>apply(value.opportunity));},
  async adoptOpportunity(opportunityId){
   const state=getState(),entry=choices(state.opportunity?.opportunities).find(o=>o.id===opportunityId),workspaceId=state.workspaceId;
   if(closed||adopting||state.busy||state.searching||executing(state)||!state.opportunity?.consent?.enabled||!entry)return false;
   if(!workspaceId){patch({opportunityError:'先在当前工作区打开 Finder，再试这个办法。'});return false;}
   if(state.opportunity.consent.workspace&&state.opportunity.consent.workspace.workspaceId!==workspaceId){patch({opportunityError:'这条建议来自另一个工作区，请回到对应工作区或重新选择参考资料。'});return false;}
   if(!preserve(entry))return false;
   abort();adopting=true;let accepted=false;
   try{
    await run('opportunity-adopt','opportunity-adopt',{opportunityId,workspaceId},value=>{
     apply(value.opportunity);patch({opportunityAdoption:value.adoption||null});
     if(getState().workspaceId!==workspaceId||value.adoption?.workspaceId!==workspaceId){patch({opportunityError:'工作区已经切换。原建议和方案关联已保留，请回到原工作区继续，未在新工作区应用。'});return;}
     if(value.workflow&&value.adoption?.status==='ready'){applyResult(value);accepted=true;}
     else patch({opportunityError:'这条建议的准备记录已保留，结果尚未确认；没有重复创建任务。'});
    });return accepted;
   }finally{adopting=false;}
  },
  cancelOpportunityDiscovery(){abort();},
 };
 return{methods,apply,maybeRefresh(){const op=getState().opportunity;if(op?.consent?.enabled&&(op.status==='idle'||op.stale))void methods.discoverOpportunities();},close(){closed=true;abort();}};
}
