import {createHmac,randomUUID} from 'node:crypto';
import {POLICY_VERSION,validateTelemetryEvent,sanitizeTelemetryText,publicTelemetryRepository} from './telemetry-contract.js';

const fresh=()=>({format:1,consent:'unasked',enabled:false,policyVersion:POLICY_VERSION,epochId:null,acceptedAt:null,registration:null,retired:[],acks:[],lastSyncedAt:null,lastError:'',deletionPending:false,deleteConfirmed:false,lastDeletedAt:null});
const clone=value=>structuredClone(value);
const digest=(key,value)=>createHmac('sha256',key).update(value).digest('hex');
const safeMessage='集中同步暂未完成，记录仍保存在本机；可稍后刷新状态。';
const cleanList=(values,max)=>Array.isArray(values)?values.slice(0,6).map(value=>sanitizeTelemetryText(value,max)).filter(Boolean):[];

/** Consent state and ACKs are separate from immutable task-owned event envelopes. */
export function createTelemetry({store,endpoint,listPending=async()=>[],fetchImpl=fetch,clientVersion='unknown',hostVersion='unknown',environment='production',autoSchedule=true,retryBaseMs=5000}={}){
  const target=new URL(endpoint);
  if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash)throw new TypeError('Collector must be a fixed HTTPS endpoint');
  endpoint=target.href.replace(/\/$/,'');
  let state,loaded,closed=false,writing=Promise.resolve(),running=null,timer=null,activeFetch=null,retry=0,flushRequested=false;
  const load=async()=>{
    if(!loaded)loaded=(async()=>{const saved=await store.read();state=saved??fresh();
      if(state.format!==1||!['unasked','declined','accepted'].includes(state.consent)||!Array.isArray(state.acks)||!Array.isArray(state.retired))throw new TypeError('Invalid telemetry storage');
      if(state.policyVersion!==POLICY_VERSION){state={...state,enabled:false,consent:'unasked'};}
    })().catch(error=>{loaded=null;throw error;});await loaded;
  };
  const mutate=fn=>{
    const next=writing.catch(()=>{}).then(async()=>{await load();const copy=clone(state);await fn(copy);await store.write(copy);state=copy;});
    writing=next;return next;
  };
  const eligible=context=>Boolean(!closed&&state.enabled&&state.consent==='accepted'&&state.policyVersion===POLICY_VERSION&&context?.epochId===state.epochId&&context?.policyVersion===POLICY_VERSION);
  const cancel=()=>{if(timer)clearTimeout(timer);timer=null;activeFetch?.abort();activeFetch=null;};
  const schedule=(delay=0)=>{if(closed||!autoSchedule)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},delay);timer.unref?.();};
  const pending=async()=>{
    if(!state.enabled||!state.epochId)return[];
    const acknowledged=new Set(state.acks),cutoff=Date.now()-90*86400000;
    return(await listPending(state.epochId)).filter(event=>event.epochId===state.epochId&&!acknowledged.has(event.eventId)&&Date.parse(event.occurredAt)>=cutoff);
  };
  const request=async(path,{method='POST',token,body,epochId}={})=>{
    if(epochId&&(!state.enabled||state.epochId!==epochId||closed))throw Error('Consent changed');
    const controller=new AbortController();activeFetch=controller;
    const timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetchImpl(endpoint+path,{method,redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!response.ok)throw new Error('Collector HTTP '+response.status);
      const value=await response.text();if(value.length>65536)throw Error('Collector reply too large');return JSON.parse(value);
    }finally{clearTimeout(timeout);if(activeFetch===controller)activeFetch=null;}
  };
  const deleteRemote=async()=>{
    const targets=[...state.retired,...(state.registration?[state.registration]:[])];
    for(const registration of targets){
      const result=await request('/v1/installation',{method:'DELETE',token:registration.deleteToken});
      if(result?.deleted!==true)throw Error('Deletion not acknowledged');
      await mutate(next=>{next.retired=next.retired.filter(row=>row.installationId!==registration.installationId);if(next.registration?.installationId===registration.installationId)next.registration=null;});
    }
    await mutate(next=>{next.deletionPending=false;next.deleteConfirmed=true;next.lastDeletedAt=new Date().toISOString();next.lastError='';next.acks=[];});
  };
  async function flush(){
    if(closed)return;if(running){flushRequested=true;return running;}
    running=(async()=>{
      await load();
      try{
        if(state.deletionPending){await deleteRemote();retry=0;return;}
        if(!state.enabled)return;
        const epochId=state.epochId;let rows=await pending();if(!rows.length||!state.enabled||state.epochId!==epochId||closed)return;
        if(!state.registration){
          const result=await request('/v1/register',{epochId,body:{policyVersion:POLICY_VERSION,consentedAt:state.acceptedAt,clientVersion,environment}});
          if(!result||['installationId','uploadToken','deleteToken'].some(key=>typeof result[key]!=='string'||!result[key]||result[key].length>300))throw Error('Registration not confirmed');
          await mutate(next=>{
            const registration={installationId:result.installationId,uploadToken:result.uploadToken,deleteToken:result.deleteToken};
            if(next.enabled&&next.epochId===epochId)next.registration=registration;else next.retired.push(registration);
          });
        }
        for(let round=0;round<5;round++){
          if(closed||!state.enabled||state.epochId!==epochId)return;
          rows=await pending();if(!rows.length)break;
          if(closed||!state.enabled||state.epochId!==epochId)return;
          const batch=[];let bytes=80;
          for(const row of rows.slice(0,20)){validateTelemetryEvent(row);const size=Buffer.byteLength(JSON.stringify(row),'utf8')+1;if(bytes+size>64000)break;batch.push(row);bytes+=size;}
          if(!batch.length)throw Error('Telemetry batch exceeds capacity');
          const registration=state.registration;if(!registration)return;
          const result=await request('/v1/events',{epochId,token:registration.uploadToken,body:{schemaVersion:1,events:batch}});
          const known=new Set(batch.map(row=>row.eventId));
          if(!Array.isArray(result?.acceptedEventIds)||!result.acceptedEventIds.length||result.acceptedEventIds.some(id=>!known.has(id)))throw Error('Events not acknowledged');
          if(!state.enabled||state.epochId!==epochId)return;
          await mutate(next=>{if(next.enabled&&next.epochId===epochId){next.acks=[...new Set([...next.acks,...result.acceptedEventIds])];next.lastSyncedAt=new Date().toISOString();next.lastError='';}});
        }
        retry=0;if((await pending()).length)schedule(500);
      }catch{
        if(!closed){await mutate(next=>{next.lastError=safeMessage;}).catch(()=>{});if(state.enabled||state.deletionPending)schedule(Math.min(300000,retryBaseMs*2**Math.min(retry++,6)));}
      }
    })().finally(()=>{running=null;if(flushRequested){flushRequested=false;if(state.enabled||state.deletionPending)schedule();}});
    return running;
  }
  return{
    async status(){
      await load();let queued=0;
      try{queued=(await pending()).length;}catch{state.lastError=safeMessage;}
      return{enabled:state.enabled,consent:state.consent,policyVersion:POLICY_VERSION,endpoint,queued,delivered:state.acks.length,lastSyncedAt:state.lastSyncedAt,lastError:state.lastError,deletionPending:state.deletionPending,deleteConfirmed:state.deleteConfirmed,lastDeletedAt:state.lastDeletedAt,hasRemoteRegistration:Boolean(state.registration||state.retired.length)};
    },
    async capture(){await load();return eligible({epochId:state.epochId,policyVersion:state.policyVersion})?{epochId:state.epochId,policyVersion:POLICY_VERSION,acceptedAt:state.acceptedAt}:null;},
    async setConsent({enabled,policyVersion}={}){
      if(typeof enabled!=='boolean'||policyVersion!==POLICY_VERSION)throw new TypeError('Please read the current consent policy');
      cancel();await mutate(next=>{
        if(enabled){if(next.enabled)return;if(next.deletionPending)throw new TypeError('Deletion must finish before enabling a new cycle');if(next.registration){next.retired.push(next.registration);next.registration=null;}if(next.retired.length>20)throw new TypeError('Delete previous cycles before enabling');next.epochId=randomUUID();next.acceptedAt=new Date().toISOString();next.acks=[];}
        next.enabled=enabled;next.consent=enabled?'accepted':'declined';next.policyVersion=POLICY_VERSION;next.lastError='';next.deleteConfirmed=false;
      });retry=0;if(enabled)schedule();return this.status();
    },
    async requestDelete(){
      // A registration response may already be decoded while its abort arrives.
      // Keep deletion pending until that flush exits and any late tokens are revoked.
      cancel();await mutate(next=>{next.enabled=false;next.consent='declined';next.deletionPending=Boolean(next.registration||next.retired.length||running);next.deleteConfirmed=!next.deletionPending;next.lastError='';if(next.deleteConfirmed)next.lastDeletedAt=new Date().toISOString();});
      if(state.deletionPending)schedule();return this.status();
    },
    async createEvent({context,type,task,revision,feedback,key,draftStatus}={}){
      await load();if(!eligible(context))return null;
      const workflow=revision?.workflow??revision??{},intent=workflow.intent??{},plan=workflow.plan;
      const selected=new Set(plan?.pluginIds??[]);
      const data={};
      // New feedback also needs its scenario when consent started after the plan
      // was made. This is context for that new action, never a history backfill.
      data.task={summary:sanitizeTelemetryText(intent.goal,500),capabilities:cleanList(intent.capabilities,150),constraints:cleanList(intent.constraints,200)};
      if(plan)data.plan={kind:plan.kind,title:sanitizeTelemetryText(plan.title,160),rationale:sanitizeTelemetryText(plan.rationale,700),steps:(plan.steps??[]).slice(0,10).map(step=>({owner:String(step.owner).slice(0,200),action:sanitizeTelemetryText(step.action,160)}))};
      data.plugins=(workflow.candidates??[]).slice(0,8).map(plugin=>({name:String(plugin.name??plugin.id).slice(0,200),version:String(plugin.install?.version??'').slice(0,80),commit:/^[a-f0-9]{40}$/i.test(plugin.install?.commit??'')?plugin.install.commit:null,repository:publicTelemetryRepository(plugin.repository),sourceType:['git','npm'].includes(plugin.install?.type)?plugin.install.type:'unknown',modelSelected:selected.has(plugin.id),userSelected:['plan_selected','handoff_prepared'].includes(type)&&selected.has(plugin.id),installationStatus:'unknown'}));
      if(feedback)data.feedback={outcome:feedback.outcome??null,note:sanitizeTelemetryText(feedback.note??feedback.feedbackText??'',700),stage:sanitizeTelemetryText(feedback.stage??'result',80),evidence:'user_reported'};
      if(draftStatus)data.draftStatus=draftStatus;
      const taskId=digest(context.epochId,String(task?.id??'')),revisionId=digest(context.epochId,String(revision?.id??''));
      const event={schemaVersion:1,eventId:digest(context.epochId,type+':'+taskId+':'+revisionId+':'+String(key??feedback?.id??'')),epochId:context.epochId,taskId,revisionId,type,occurredAt:new Date().toISOString(),clientVersion,hostVersion,data};
      validateTelemetryEvent(event);return eligible(context)?event:null;
    },
    committed(){schedule();},
    flush,
    close(){closed=true;cancel();},
  };
}
