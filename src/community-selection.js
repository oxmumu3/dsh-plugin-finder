import {getCommunityEntry} from './community-catalog.js';
import {fail} from './contracts.js';
import {repositoryOf} from './supply.js';

// Imported metadata is not an authority token. Bind the advisory plan to the
// catalog identity, then recheck author metadata before a new execution claim.
export function assertCommunityPlan(workflow,code='INVALID_BACKUP'){
  if(!workflow.communityEntryId||workflow.creation||workflow.stage!=='plan')return null;
  const entry=getCommunityEntry(workflow.communityEntryId);
  // Keep historical records readable if a future catalog removes an entry.
  // Execution/recommendation separately require a currently available entry.
  if(!entry)return null;
  if(!['single','gap'].includes(workflow.plan?.kind))fail(code);
  const repo=repositoryOf(entry.sourceUrl);
  for(const candidate of workflow.candidates??[]){
    if(candidate.communityEntryId!==entry.id||candidate.communitySourceUrl!==entry.sourceUrl)fail(code);
    if(candidate.repository&&repositoryOf(candidate.repository)?.url.toLowerCase()!==repo.url.toLowerCase())fail(code);
    const install=candidate.install;
    if(entry.npmName){
      if(candidate.id!==entry.npmName||candidate.name!==entry.npmName||install?.type!=='npm'||install.version!==entry.version||install.spec!==`${entry.npmName}@${entry.version}`)fail(code);
      if(install.registry&&install.registry!=='https://registry.npmjs.org/'&&install.registry!=='https://registry.npmjs.org')fail(code);
    }else{
      const match=String(install?.spec??'').match(/^git\+(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.git#([a-f0-9]{40})(?:&path:\/(.+))?$/);
      if(install?.type!=='git'||!match||match[1].toLowerCase()!==repo.url.toLowerCase()||install.commit!==match[2])fail(code);
      const directory=match[3]??'';
      if(repo.treeSegments?(!directory||!repo.treeSegments.join('/').endsWith('/'+directory)):Boolean(directory))fail(code);
    }
  }
  return entry;
}

export function sameCommunityInstall(left,right){
  return left?.id===right?.id&&left?.communityEntryId===right?.communityEntryId&&left?.communitySourceUrl===right?.communitySourceUrl&&left?.install?.type===right?.install?.type&&left?.install?.version===right?.install?.version&&left?.install?.spec===right?.install?.spec;
}
