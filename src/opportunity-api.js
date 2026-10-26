import {FinderError,record,text} from './contracts.js';
import {createOpportunityEngine} from './opportunities.js';
import {issueOpportunityOrigin} from './opportunity-origin.js';

const fail=(code,status=400)=>{throw new FinderError(code,status);};
// These FinderError codes arise in host-model invocation/parsing before history.append.
// Cancellation, shutdown, storage and arbitrary exceptions are intentionally absent.
const PRE_ANALYSIS_COMMIT_ERRORS=new Set(['MODEL_UNAVAILABLE','MODEL_TIMEOUT','MODEL_REQUEST_FAILED','MODEL_INVALID_OUTPUT','MODEL_INCOMPLETE','MODEL_OUTPUT_LIMIT','ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_QUOTA','ACCOUNT_TOKEN_INVALID']);
const safeError=error=>({code:error instanceof FinderError?error.code:'MODEL_REQUEST_FAILED',message:error instanceof FinderError?error.message:new FinderError('MODEL_REQUEST_FAILED').message});

/** Opportunity discovery is read-only; only explicit adoption starts the existing search pipeline. */
export function withOpportunityApi(core,options={}){
  const engine=createOpportunityEngine(options),active=new Map();let closed=false;
  const ensure=()=>{if(closed)fail('CLOSED',503);};
  const status=async()=>{ensure();return{opportunity:await engine.status()};};
  const adoptionResult=async adoption=>{
    if(!adoption.taskId||!adoption.revisionId)return{...await status(),adoption:{...adoption,pending:true},pending:true};
    const response=await core.open({taskId:adoption.taskId,revisionId:adoption.revisionId});
    return{...response,...await status(),adoption,duplicate:true};
  };
  const adopt=async input=>{
    ensure();if(!record(input)||Object.keys(input).some(k=>!['opportunityId','workspaceId','signal'].includes(k)))fail('INVALID_INPUT');
    const opportunityId=text(input.opportunityId,200),workspaceId=text(input.workspaceId,200);
    const underway=active.get(opportunityId);if(underway){if(underway.workspaceId!==workspaceId)fail('OPPORTUNITY_WORKSPACE_MISMATCH',409);return underway.promise;}
    const own=new AbortController(),stop=()=>own.abort();input.signal?.addEventListener('abort',stop,{once:true});if(input.signal?.aborted)stop();
    const operation=(async()=>{
      const {opportunity,consent,sourceRestrictions}=await engine.currentOpportunity(opportunityId,{signal:own.signal});
      if(consent.workspace&&consent.workspace.workspaceId!==workspaceId)fail('OPPORTUNITY_WORKSPACE_MISMATCH',409);
      await engine.validateWorkspace(workspaceId,own.signal);
      if(own.signal.aborted)fail('MODEL_ABORTED',499);
      const claim=await engine.claimAdoption(opportunity,workspaceId,{sourceRestrictions});let adoption=claim.adoption;
      if(adoption.status==='ready')return adoptionResult(adoption);
      // Only an explicitly recorded pre-append model failure permits a user-triggered retry.
      // Unknown outcomes still cannot be resolved by matching text or guessing a new task id.
      const retryAnalysis=!claim.acquired&&!adoption.taskId&&adoption.status==='failed'&&adoption.phase==='analyze'&&adoption.retryableAnalysis===true&&PRE_ANALYSIS_COMMIT_ERRORS.has(adoption.error?.code);
      if(!claim.acquired&&!adoption.taskId&&!retryAnalysis)return{...await status(),adoption:{...adoption,pending:true},pending:true};
      if(!claim.acquired&&adoption.phase==='recommending'&&!adoption.error)return{...await status(),adoption:{...adoption,pending:true},pending:true};
      try{
        let response;
        if(claim.acquired||retryAnalysis){
          // Clear retry authority durably before invoking the model again. A crash is then pending.
          if(retryAnalysis)adoption=await engine.recordAdoption(adoption.id,{status:'claimed',phase:'analyze',retryableAnalysis:false,error:null});
          response=await core.analyze({request:adoption.request,localOnly:true,opportunityOrigin:issueOpportunityOrigin({adoptionId:adoption.id,opportunityId:adoption.opportunityId,workspaceId:adoption.workspaceId,epoch:adoption.epoch}),signal:own.signal});
          if(!response?.workflow?.taskId||!response.workflow.revisionId)fail('OPPORTUNITY_PENDING',409);
          // Bind immediately after the analysis is durable, before requesting a plan.
          adoption=await engine.recordAdoption(adoption.id,{status:'analyzed',phase:'analyzed',taskId:response.workflow.taskId,revisionId:response.workflow.revisionId,retryableAnalysis:false,error:null});
        }else response=await core.open({taskId:adoption.taskId,revisionId:adoption.revisionId});
        if(own.signal.aborted||!await engine.epochMatches(adoption.epoch))fail('MODEL_ABORTED',499);
        adoption=await engine.recordAdoption(adoption.id,{status:'analyzed',phase:'recommending',error:null});
        response=await core.recommend({intent:response.intent??response.workflow.intent,taskId:adoption.taskId,revisionId:adoption.revisionId,signal:own.signal});
        if(!response?.workflow?.taskId||!response.workflow.revisionId)fail('OPPORTUNITY_PENDING',409);
        adoption=await engine.recordAdoption(adoption.id,{status:'ready',phase:'ready',taskId:response.workflow.taskId,revisionId:response.workflow.revisionId,error:null});
        if(own.signal.aborted||!await engine.epochMatches(adoption.epoch))fail('MODEL_ABORTED',499);
        return{...response,...await status(),adoption,duplicate:!claim.acquired,opportunityOrigin:{id:opportunity.id,title:opportunity.title,evidenceRefs:opportunity.evidenceRefs}};
      }catch(cause){
        const code=cause?.code;
        // Once a history write is uncertain, preserve the claim instead of inventing a link.
        const uncertain=['HISTORY_STORAGE_FAILED','OPPORTUNITY_STORAGE_FAILED','OPPORTUNITY_PENDING'].includes(code);
        const retryableAnalysis=!adoption.taskId&&cause instanceof FinderError&&PRE_ANALYSIS_COMMIT_ERRORS.has(code);
        await engine.recordAdoption(adoption.id,adoption.taskId?{status:'failed',phase:uncertain?'recommending':'recommend',retryableAnalysis:false,error:uncertain?null:safeError(cause)}:{status:retryableAnalysis?'failed':'claimed',phase:'analyze',retryableAnalysis,error:safeError(cause)}).catch(()=>{});
        throw cause;
      }
    })();
    active.set(opportunityId,{workspaceId,own,promise:operation});
    try{return await operation;}finally{input.signal?.removeEventListener('abort',stop);if(active.get(opportunityId)?.promise===operation)active.delete(opportunityId);}
  };
  const boundWorkspace=async input=>{const adoption=await engine.adoptionForTask(input?.taskId);if(adoption&&input?.workspaceId!==adoption.workspaceId)fail('OPPORTUNITY_WORKSPACE_MISMATCH',409);};
  return{...core,
    async executionClaim(input){await boundWorkspace(input);return core.executionClaim(input);},
    async creatorClaim(input){await boundWorkspace(input);return core.creatorClaim(input);},
    async bootstrap(){return{...await core.bootstrap(),...await status()};},
    opportunityStatus:status,
    async opportunityGrant(input){if(typeof input?.enabled==='boolean')for(const item of active.values())item.own.abort();const result=await engine.grant(input);return{opportunity:{...result,historyChoices:(await engine.status()).historyChoices}};},
    async opportunityDiscover(input){return{opportunity:{...await engine.discover(input),historyChoices:(await engine.status()).historyChoices}};},
    async opportunityFeedback(input){return{opportunity:{...await engine.feedback(input),historyChoices:(await engine.status()).historyChoices}};},
    async opportunityContext(input){return engine.contextMetadata(input);},
    opportunityAdopt:adopt,
    close(){if(closed)return;closed=true;for(const item of active.values())item.own.abort();active.clear();engine.close();core.close();},
  };
}
