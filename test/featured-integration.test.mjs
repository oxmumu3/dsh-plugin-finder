import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';

const request = '整理研究资料，原文只读';
const intent = {goal:'整理研究',input:'Markdown',output:'资料库',constraints:['原文只读'],capabilities:['本地检索'],queries:['local markdown search']};
const plugin = {id:'library',name:'Library',summary:'本地检索',capabilities:['本地检索'],requirements:{extraApiKey:'unknown'},install:{spec:'library@1.2.3',version:'1.2.3'}};
const plan = {kind:'single',title:'本地研究库',rationale:'作者资料声明，待验收',pluginIds:['library'],steps:[{capability:'本地检索',owner:'library',sourceCapability:'本地检索',action:'检索',input:'Markdown',output:'结果'}],limits:['尚未运行']};
const blueprint = {name:'研究库',purpose:'整理研究',workflow:'选择目录并检索',inputs:'Markdown',outputs:'资料库',ui:'侧栏列表',data:'原文只读，标注另存',tools:'本地检索',runtime:'沿用宿主模型',scope:'只处理所选目录',acceptance:'输入两篇 Markdown，检索返回原文位置'};
const generated = {strategy:'new',reuseAssessment:'用户主动定制，供给仍需核对。',candidateDecisions:[{pluginId:'library',decision:'unknown',reason:'尚未运行'}],questions:[{id:'usage',question:'如何使用研究库？',options:['侧栏列表','会话提问'],reason:'影响界面'}],assumptions:['运行前核对宿主工具'],blueprint};
const ids = workflow => ({taskId:workflow.taskId,revisionId:workflow.revisionId});
const copy = value => JSON.parse(JSON.stringify(value));

let compiledClient;
async function clientModule() {
  compiledClient ??= build({entryPoints:[fileURLToPath(new URL('../src/client.js',import.meta.url))],bundle:true,format:'iife',globalName:'clientModule',platform:'browser',external:['react','@deepseek-ai/dsh-client-ui-primitives'],write:false});
  const React = {createElement:(type,props,...children)=>({type,props,children})};
  const globals = {AbortController,AbortSignal,URL,setTimeout,clearTimeout,console,require:name=>{
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return {MarkdownText:props=>React.createElement('div',{'data-official-markdown':true},props.text),MarkdownDelegateProvider:props=>props.children};
    assert.equal(name,'react');return React;
  }};
  vm.runInContext((await compiledClient).outputFiles[0].text,vm.createContext(globals));
  return globals.clientModule;
}

async function fixture(t,{creation=false}={}) {
  const rows = new Map(), draftValues = new Map(), modelCalls = [], paths = [];
  let pointer = {activeTaskId:null,activeRevisionId:null};
  const historyStore = {
    read:async id=>structuredClone(rows.get(id)),
    write:async row=>rows.set(row.id,structuredClone(row)),
    list:async()=>structuredClone([...rows.values()]),
    readPointer:async()=>structuredClone(pointer),
    writePointer:async value=>{pointer=structuredClone(value);},
  };
  const service = createFinderService({historyStore,hostVersion:'0.2.1-rc.2',
    discovery:{search:async()=>({candidates:[plugin],sources:[{id:'synthetic',status:'live'}],warnings:[],searchedAt:'2026-10-22T00:00:00Z'})},
    model:{status:()=>({configured:true,label:'Synthetic model'}),call:async args=>{
      modelCalls.push(args);
      return {text:JSON.stringify(args.system.includes('CREATION_SCHEMA')?generated:args.system.includes('仅允许 {"kind"')?plan:intent),model:{label:'Synthetic model'}};
    }},
  });
  t.after(()=>service.close());
  const analyzed = await service.analyze({request});
  let saved = await service.recommend({...ids(analyzed.workflow),intent:analyzed.intent});
  if (creation) saved = await service.creationStart({...ids(saved.workflow),trigger:'user-customization'});

  const routes = new Map();
  const stopRoutes = registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.set(route.path,route);return()=>routes.delete(route.path);}}}),effect(){}},service);
  t.after(stopRoutes);
  let loseResetResponse = true;
  const fetch = async (path,options) => {
    paths.push({path,body:options.body?JSON.parse(options.body):null});
    const route = routes.get(path);
    assert.ok(route,`No synthetic route for ${path}`);
    const response = await route.fetch(new Request(`http://finder.test${path}`,{method:options.method,headers:options.headers,body:options.body,signal:options.signal}));
    if (path.endsWith('/reset') && loseResetResponse && response.ok) {
      loseResetResponse = false;
      assert.equal((await response.clone().json()).cleared,true);
      throw new Error('Synthetic lost response after reset committed');
    }
    return response;
  };
  const {createFinderController} = await clientModule();
  const controller = createFinderController({}, {fetch,draftStorage:{getItem:key=>draftValues.get(key),setItem:(key,value)=>draftValues.set(key,value),removeItem:key=>draftValues.delete(key)}});
  t.after(()=>controller.close());
  assert.equal(await controller.bootstrap(),true);
  return {controller,service,saved:saved.workflow,modelCalls,paths,pointer:()=>structuredClone(pointer)};
}

test('featured retry after a committed reset with a lost response starts the selected scenario without a model call',async t=>{
  const f = await fixture(t), c = f.controller, callCount = f.modelCalls.length;
  assert.equal(await c.tryFeatured('agent-twin'),false);
  assert.deepEqual(f.pointer(),{activeTaskId:null,activeRevisionId:null});
  assert.equal(c.getSnapshot().taskId,f.saved.taskId);
  assert.equal(c.getSnapshot().resetPending,true);
  assert.equal(await c.retryReset(),true);
  assert.equal(c.getSnapshot().taskId,null);
  assert.equal(c.getSnapshot().stage,'describe');
  assert.match(c.getSnapshot().request,/AI 分身/);
  assert.equal(c.getSnapshot().featuredDrafts[0].revisionId,f.saved.revisionId);
  assert.equal(f.modelCalls.length,callCount);
});

test('featured reset recovery keeps edited understanding usable by the real recommendation service',async t=>{
  const f = await fixture(t), c = f.controller, callCount = f.modelCalls.length;
  assert.equal(await c.tryFeatured('agent-twin'),false);
  assert.equal(f.pointer().activeTaskId,null);
  c.editIntent({goal:'失败后编辑的研究目标'});
  const edited = copy(c.getSnapshot().intent);
  assert.equal(await c.retryReset(),true);
  assert.deepEqual(f.pointer(),{activeTaskId:f.saved.taskId,activeRevisionId:f.saved.revisionId});
  assert.deepEqual(copy(c.getSnapshot().intent),edited);
  assert.equal(c.getSnapshot().stage,'understand');
  assert.equal(c.getSnapshot().resetPending,false);
  assert.equal(f.modelCalls.length,callCount,'recovering the exact revision does not call a model');
  assert.deepEqual(f.paths.at(-1),{path:'/api/plugin_finder/open',body:ids(f.saved)});
  assert.equal(await c.recommend(),true);
  const persisted = (await f.service.bootstrap()).workflow;
  assert.equal(persisted.taskId,f.saved.taskId);
  assert.notEqual(persisted.revisionId,f.saved.revisionId);
  assert.equal(persisted.intent.goal,edited.goal);
  assert.equal(f.modelCalls.length,callCount+1);
});

test('featured reset recovery keeps edited blueprint usable by the real creation service',async t=>{
  const f = await fixture(t,{creation:true}), c = f.controller, callCount = f.modelCalls.length;
  assert.equal(await c.tryFeatured('family-assistant'),false);
  assert.equal(f.pointer().activeTaskId,null);
  c.editCreation({blueprint:{name:'失败后编辑的蓝图名称'},answers:[{id:'usage',answer:'会话提问',assumed:false}],assumptions:['保留新写的假设']});
  const edited = copy(c.getSnapshot().creationForm);
  assert.equal(await c.retryReset(),true);
  assert.deepEqual(f.pointer(),{activeTaskId:f.saved.taskId,activeRevisionId:f.saved.revisionId});
  assert.deepEqual(copy(c.getSnapshot().creationForm),edited);
  assert.equal(c.getSnapshot().creationDirty,true);
  assert.equal(c.getSnapshot().resetPending,false);
  assert.deepEqual(f.paths.at(-1),{path:'/api/plugin_finder/open',body:ids(f.saved)});
  assert.equal(await c.updateCreation(),true);
  const persisted = (await f.service.bootstrap()).workflow;
  assert.equal(persisted.taskId,f.saved.taskId);
  assert.notEqual(persisted.revisionId,f.saved.revisionId);
  assert.deepEqual(persisted.creation.blueprint,edited.blueprint);
  assert.deepEqual(persisted.creation.answers,edited.answers);
  assert.deepEqual(persisted.creation.assumptions,edited.assumptions);
  const backup = await f.service.exportTask({taskId:f.saved.taskId});
  assert.equal(backup.task.revisions.find(revision=>revision.id===f.saved.revisionId).workflow.creation.blueprint.name,blueprint.name);
  assert.equal(f.modelCalls.length,callCount,'recovery and saving an unconfirmed edit do not call a model');
});
