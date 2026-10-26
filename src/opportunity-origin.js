import {FinderError,record,text} from './contracts.js';

const issued=new WeakSet();
export const OPPORTUNITY_TASK_PREFIX='opportunity-task-';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const invalid=code=>{throw new FinderError(code);};

// Persisted provenance is restrictive metadata. A plain JSON object never gains
// the authority to create a locally scoped task, even if it claims to be local.
export function parseOpportunityOrigin(value,code='INVALID_BACKUP'){
  const keys=['version','adoptionId','opportunityId','workspaceId','epoch','provenance'];
  if(!record(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key))||value.version!==1||!['local','imported'].includes(value.provenance))invalid(code);
  const clean={version:1,adoptionId:text(value.adoptionId,200,code),opportunityId:text(value.opportunityId,200,code),workspaceId:text(value.workspaceId,200,code),epoch:text(value.epoch,200,code),provenance:value.provenance};
  if(!UUID.test(clean.adoptionId)||!/^opportunity-[0-9a-f]{32}$/u.test(clean.opportunityId)||!UUID.test(clean.epoch))invalid(code);
  return clean;
}
export function issueOpportunityOrigin({adoptionId,opportunityId,workspaceId,epoch}){
  const value=Object.freeze(parseOpportunityOrigin({version:1,adoptionId,opportunityId,workspaceId,epoch,provenance:'local'},'INVALID_INPUT'));
  issued.add(value);return value;
}
export const isIssuedOpportunityOrigin=value=>issued.has(value);
export const opportunityTaskId=value=>OPPORTUNITY_TASK_PREFIX+parseOpportunityOrigin(value).adoptionId;
export const sameOpportunityOrigin=(left,right)=>JSON.stringify(parseOpportunityOrigin(left))===JSON.stringify(parseOpportunityOrigin(right));
export function requireOpportunityWorkspace(workflow,workspaceId){
  if(!workflow?.opportunityOrigin)return;
  const origin=parseOpportunityOrigin(workflow.opportunityOrigin);
  if(origin.provenance!=='local')throw new FinderError('OPPORTUNITY_SCOPE_REAUTH_REQUIRED',403);
  if(workspaceId!==origin.workspaceId)throw new FinderError('OPPORTUNITY_WORKSPACE_MISMATCH',409);
}
