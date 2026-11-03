import test from 'node:test';
import assert from 'node:assert/strict';
import * as contracts from '../src/contracts.js';

const {parsePlan}=contracts;
const copy=structuredClone;
const sentinel='PRIVATE_SENTINEL_MUST_NOT_ESCAPE';
const candidates=[{id:'existing',capabilities:['read']},{id:'another',capabilities:['read']}];
const intent={capabilities:['read','persist']};
const hybrid={kind:'hybrid',title:'保留现成能力，只补持久化',rationale:'作者资料仍待实际任务核对',pluginIds:['existing'],gaps:[{capability:'persist',reason:'专用持久化界面需要补充'}],steps:[{capability:'read',owner:'existing',sourceCapability:'read',action:'读取',input:'当前工作区',output:'内容'},{capability:'persist',owner:'create',sourceCapability:null,action:'补充',input:'内容',output:'持久化结果'}],limits:['声明不等于验收']};
const issue=(path,type)=>({stage:'recommend.parse',path,type});
function rejects(value,path,type){
 assert.throws(()=>parsePlan(value,candidates,intent),error=>{
  assert.equal(error.code,'MODEL_INVALID_OUTPUT');assert.equal(error.status,502);
  assert.deepEqual(error.details,issue(path,type));assert.ok(!JSON.stringify(error.details).includes(sentinel));return true;
 });
}

test('plan diagnostics reject JSON and undeclared fields without echoing private data or unknown keys',()=>{
 rejects('{'+sentinel,'plan','json');rejects([], 'plan','type');
 rejects({...hybrid,[sentinel]:sentinel},'plan','unknown-field');
 const step=copy(hybrid);step.steps[0][sentinel]=sentinel;rejects(step,'plan.steps[0]','unknown-field');
 const gap=copy(hybrid);gap.gaps[0][sentinel]=sentinel;rejects(gap,'plan.gaps[0]','unknown-field');
 const malformed=copy(hybrid);malformed.steps[0]='{'+sentinel;rejects(malformed,'plan.steps[0]','json');
});
test('kind, selected IDs and kind cardinality have bounded known diagnostic paths',()=>{
 const cases=[
  [p=>{delete p.kind;},'plan.kind','required'],[p=>{p.kind=sentinel;},'plan.kind','value'],
  [p=>{delete p.pluginIds;},'plan.pluginIds','required'],[p=>{p.pluginIds=null;},'plan.pluginIds','type'],
  [p=>{p.pluginIds=Array(5).fill(sentinel);},'plan.pluginIds','length'],
  [p=>{p.pluginIds=[5];},'plan.pluginIds[0]','type'],[p=>{p.pluginIds=[''];},'plan.pluginIds[0]','required'],
  [p=>{p.pluginIds=[sentinel.repeat(20)];},'plan.pluginIds[0]','length'],
  [p=>{p.pluginIds=[sentinel];},'plan.pluginIds[0]','unknown-candidate'],
  [p=>{p.pluginIds=['existing','existing'];},'plan.pluginIds[1]','duplicate'],
  [p=>{p.pluginIds=[];},'plan.pluginIds','cardinality'],
 ];
 for(const [mutate,path,type]of cases){const p=copy(hybrid);mutate(p);rejects(p,path,type);}
 for(const kind of ['native','gap'])rejects({...hybrid,kind},'plan.pluginIds','cardinality');
 rejects({...hybrid,kind:'single',pluginIds:[]},'plan.pluginIds','cardinality');
 rejects({...hybrid,kind:'combo'},'plan.pluginIds','cardinality');
});
test('hybrid gaps retain strict known-capability, ownership and bounded object validation',()=>{
 const cases=[
  [p=>{p.gaps=null;},'plan.gaps','type'],[p=>{p.gaps=Array(7).fill({});},'plan.gaps','length'],
  [p=>{p.gaps=[[]];},'plan.gaps[0]','type'],[p=>{delete p.gaps[0].capability;},'plan.gaps[0].capability','required'],
  [p=>{p.gaps[0].capability=sentinel;},'plan.gaps[0].capability','unknown-capability'],
  [p=>{p.gaps.push(copy(p.gaps[0]));},'plan.gaps[1].capability','duplicate'],
  [p=>{delete p.gaps[0].reason;},'plan.gaps[0].reason','required'],
  [p=>{p.gaps[0].reason=sentinel.repeat(100);},'plan.gaps[0].reason','length'],
  [p=>{p.gaps=[];},'plan.gaps','cardinality'],[p=>{delete p.gaps;},'plan.gaps','cardinality'],
  [p=>{p.steps[1].owner='human';},'plan.steps[1].owner','gap-owner'],
  [p=>{p.steps[0].owner='create';},'plan.steps[0].owner','gap-owner'],
 ];
 for(const [mutate,path,type]of cases){const p=copy(hybrid);mutate(p);rejects(p,path,type);}
 rejects({...hybrid,kind:'single'},'plan.gaps','cardinality');
});
test('step references, coverage and unused providers never weaken under diagnostics',()=>{
 const cases=[
  [p=>{delete p.steps;},'plan.steps','required'],[p=>{p.steps=null;},'plan.steps','type'],
  [p=>{p.steps=Array(11).fill({});},'plan.steps','length'],[p=>{p.steps[0]=[];},'plan.steps[0]','type'],
  [p=>{p.steps[0].owner=sentinel;},'plan.steps[0].owner','unknown-owner'],
  [p=>{p.steps[0].capability=sentinel;},'plan.steps[0].capability','unknown-capability'],
  [p=>{p.steps[0].sourceCapability=sentinel;},'plan.steps[0].sourceCapability','unknown-capability'],
  [p=>{p.steps[1].sourceCapability=sentinel;},'plan.steps[1].sourceCapability','value'],
  [p=>{p.steps.pop();},'plan.steps','coverage'],
  [p=>{p.pluginIds.push('another');},'plan.pluginIds[1]','unused-candidate'],
 ];
 for(const [mutate,path,type]of cases){const p=copy(hybrid);mutate(p);rejects(p,path,type);}
 for(const [key,max]of [['action',600],['input',400],['output',400]]){
  for(const [value,type]of [[undefined,'required'],[false,'type'],['','required'],['x'.repeat(max+1),'length'],['\u0001'+sentinel,'value']]){
   const p=copy(hybrid);p.steps[0][key]=value;rejects(p,'plan.steps[0].'+key,type);
  }
 }
});
test('title, rationale and limits report only fixed bounded field diagnostics',()=>{
 for(const [key,max]of [['title',160],['rationale',1600]]){
  for(const [value,type]of [[undefined,'required'],[5,'type'],['','required'],['x'.repeat(max+1),'length'],['\u0001'+sentinel,'value']])rejects({...hybrid,[key]:value},'plan.'+key,type);
 }
 rejects({...hybrid,title:'已验证可用'+sentinel},'plan.title','unverified-claim');
 rejects({...hybrid,limits:undefined},'plan.limits','required');rejects({...hybrid,limits:false},'plan.limits','type');
 rejects({...hybrid,limits:Array(9).fill(sentinel)},'plan.limits','length');
 rejects({...hybrid,limits:[sentinel.repeat(30)]},'plan.limits[0]','length');
});
test('diagnostics preserve accepted legacy shape, fences, sourceCapability defaults and gap coverage exemption',()=>{
 assert.deepEqual(parsePlan(hybrid,candidates,intent),hybrid);
 assert.deepEqual(parsePlan('```json\n'+JSON.stringify(hybrid)+'\n```',candidates,intent),hybrid);
 const native={kind:'native',title:'整理',rationale:'原生能力',pluginIds:[],steps:[{capability:'read',owner:'dsh',action:'读',input:'输入',output:'输出'},{capability:'persist',owner:'human',sourceCapability:undefined,action:'提供',input:'输入',output:'输出'}],limits:[]};
 const parsed=parsePlan(native,candidates,intent);assert.ok(!Object.hasOwn(parsed,'gaps'));assert.equal(parsed.steps[0].sourceCapability,null);assert.equal(parsed.steps[1].sourceCapability,null);
 assert.equal(parsePlan({...native,kind:'gap',steps:[]},candidates,intent).kind,'gap');
 const stringStep=copy(hybrid);stringStep.steps[0]=JSON.stringify(stringStep.steps[0]);assert.deepEqual(parsePlan(stringStep,candidates,intent),hybrid);
 for(const rationale of ['未经实测，不能保证可用','not verified working'])assert.equal(parsePlan({...hybrid,rationale},candidates,intent).rationale,rationale);
});
test('safe issue projection admits only schema paths, bounded indexes and an explicit fixed type vocabulary',()=>{
 assert.equal(typeof contracts.safePlanValidationIssue,'function');
 const safe=contracts.safePlanValidationIssue;
 for(const path of ['plan','plan.kind','plan.title','plan.rationale','plan.pluginIds','plan.steps','plan.gaps','plan.limits','plan.pluginIds[3]','plan.steps[9]','plan.steps[9].sourceCapability','plan.gaps[5].reason','plan.limits[7]'])assert.deepEqual(safe({...issue(path,'type'),[sentinel]:sentinel,raw:sentinel}),issue(path,'type'));
 assert.deepEqual(safe(issue('plan.kind','selection')),issue('plan.kind','selection'));
 for(const path of ['plan.'+sentinel,'plan.pluginIds[4]','plan.steps[10]','plan.steps[-1]','plan.steps[01]','plan.steps[0].'+sentinel,'plan.gaps[6].reason','plan.limits[8]','plan.steps[0].action.raw'])assert.equal(safe(issue(path,'type')),undefined);
 for(const value of [null,[],{path:'plan',type:'type'},issue('plan',sentinel),{...issue('plan','type'),stage:'creation.parse'},issue('plan.kind','type\n'+sentinel)])assert.equal(safe(value),undefined);
});
