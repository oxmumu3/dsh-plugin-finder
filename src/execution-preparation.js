import {fail,record,text} from './contracts.js';
import {publicSourceText} from './provenance.js';

const packageSpec=/^(?:npm:)?((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const stamp=value=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
export function executionCandidates(workflow,kind){return kind==='use'?(workflow.candidates??[]).filter(candidate=>workflow.plan?.pluginIds.includes(candidate.id)):[];}
export function validatePreparation(value,workflow,kind,code='INVALID_BACKUP'){
 if(!record(value)||!['pending','ready'].includes(value.status)||!stamp(value.updatedAt)||!Array.isArray(value.plugins)||value.plugins.length>2)fail(code);
 const selected=executionCandidates(workflow,kind),seen=new Set();
 const plugins=value.plugins.map(row=>{
  if(!record(row)||!['installing','ready','failed','unknown'].includes(row.status))fail(code);
  const candidateId=text(row.candidateId,200,code),candidate=selected.find(item=>item.id===candidateId);
  const exactSpec=value=>packageSpec.test(value??'')?String(value).replace(/^npm:/,''):value;
  if(!candidate||seen.has(candidateId)||exactSpec(row.spec)!==exactSpec(candidate.install?.spec)||row.version!==candidate.install?.version)fail(code);
  seen.add(candidateId);
  const expectedName=packageSpec.exec(row.spec)?.[1]??candidate.id;
  if(row.packageName!==expectedName)fail(code);
  const result={candidateId,spec:text(row.spec,3000,code),packageName:text(row.packageName,214,code),version:text(row.version,200,code),requestId:text(row.requestId,200,code),status:row.status};
  for(const key of ['installed','enabled','active'])if(row[key]!==undefined){if(typeof row[key]!=='boolean')fail(code);result[key]=row[key];}
  if(row.application!==undefined){if(!['applied','restart-required','overridden','failed','cancelled'].includes(row.application))fail(code);result.application=row.application;}
  if(row.code!==undefined){if(!/^[A-Z0-9_-]{1,100}$/i.test(row.code))fail(code);result.code=row.code;}
  if(row.source!==undefined)result.source=publicSourceText(text(row.source,3000,code));
  if(value.status==='ready'&&(row.status!=='ready'||row.installed!==true||row.enabled!==true||row.active!==true||row.application!==undefined&&row.application!=='applied'))fail(code);
  return result;
 });
 if(value.status==='ready'&&plugins.length!==selected.length)fail(code);
 return{status:value.status,plugins,updatedAt:value.updatedAt};
}
export function requirePrepared(attempt,revision){
 if(!executionCandidates(revision.workflow,attempt.kind).length)return;
 if(attempt.preparation?.status!=='ready')fail('EXECUTION_PLUGINS_NOT_READY');
 validatePreparation(attempt.preparation,revision.workflow,attempt.kind,'EXECUTION_PLUGINS_NOT_READY');
}
export function preparedPrompt(attempt){
 if(!attempt.preparation?.plugins.length)return attempt.prompt;
 return attempt.prompt+'\n\n已核实的插件安装回执（当前宿主、发送本次任务前）：\n'+JSON.stringify(attempt.preparation,null,2)+'\n这些所选插件已经由 Finder 通过当前宿主官方管理器安装、启用并核实为 active。请直接完成原用户目标，不重复安装或重新查找安装位置；这些回执更新了前文分析阶段的安装快照，但不代表任务结果已经验证。';
}
