import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {Context} from '@deepseek-ai/cordis';
const require=createRequire(import.meta.url);
test('Host entry retains existing domains and UI routes while owning one independent Agent request domain',async()=>{
  const registered=[],opened=[],closed=[],effects=[],tools=new Map(),routes=[];
  const sdk={
    '@deepseek-ai/dsh-storage-domain':{defineDomain:spec=>spec,domainTable:schema=>schema},
    '@deepseek-ai/dsh-app-boot':{getDshRuntimeVersion:()=> '0.2.1-rc.5'},
    '@deepseek-ai/dsh-tools':{defineTool:definition=>definition},
    '@deepseek-ai/dsh-sandbox':{approveEscalation:async()=>{throw Error('must not install during setup');}},
  };
  const bundled=await build({entryPoints:[new URL('../index.js',import.meta.url).pathname],bundle:true,format:'cjs',platform:'node',external:['@deepseek-ai/*'],define:{'import.meta.url':JSON.stringify(new URL('../catalog/index.mjs',import.meta.url).href)},write:false});
  const module={exports:{}};vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,require:id=>sdk[id]??require(id),Buffer,process:{versions:{node:process.versions.node},platform:process.platform},AbortController,AbortSignal,Response,Request,URL,TextDecoder,structuredClone,setTimeout,clearTimeout,console,fetch:()=>{throw Error('no network during setup');}});
  const connection={fetch:{register:route=>{routes.push(route);return()=>{};}}};
  const ctx={
    connection,tools:{register:definition=>{tools.set(definition.name,definition);return()=>tools.delete(definition.name);},get:name=>tools.get(name),schemas:()=>[...tools.values()]},
    systemPrompt:{section:spec=>{registered.push(spec);return()=>{};}},workspaceRegistry:{list:()=>[]},workingDirectory:{get:()=>undefined},sandboxPolicy:{resolve:()=>({mode:'workspace-write'})},
    get(name){return this[name];},effect:fn=>{effects.push(fn());},
    storageDomain:{async open(spec){opened.push(spec);const tables=new Map();return{table(name){if(!tables.has(name))tables.set(name,new Map());const table=tables.get(name);return{get:id=>table.get(id),put:(id,row)=>table.set(id,row),delete:id=>table.delete(id),entries:()=>table.entries()};},global:{get:()=>structuredClone(spec.global?.initial??null),set:()=>{}},async close(){closed.push(spec.name);}};}},
  };
  await module.exports.apply(ctx);
  assert.deepEqual(opened.map(spec=>spec.name),['plugin_finder','plugin_finder_history','plugin_finder_telemetry','plugin_finder_opportunities','plugin_finder_agent_requests','plugin_finder_catalog_installs']);
  for(const spec of opened)assert.equal(spec.version,1);
  assert.equal(tools.size,4);assert.equal(registered[0].name,'finder:agent-routing');
  assert.ok(routes.some(route=>route.path==='/api/plugin_finder/bootstrap'));
  assert.ok(routes.some(route=>route.path==='/api/plugin_finder/opportunity-adopt'));
  const detailRoute=routes.find(route=>route.path==='/api/plugin_finder/catalog-detail');
  assert.ok(detailRoute,'browse details must have a separate non-model endpoint');
  const response=await detailRoute.fetch(new Request('http://local/api/plugin_finder/catalog-detail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({collection:'featured',entryId:'dot-harness'})}));
  assert.equal(response.status,200);const detail=await response.json();
  // This fixture has neither a source fetch nor a plugin manager. Unknown
  // local state must not be presented as a confirmed absence.
  assert.equal(detail.entryId,'dot-harness');assert.equal(detail.installable,false);assert.equal(detail.installation.status,'unknown');
  assert.ok(routes.some(route=>route.path==='/api/plugin_finder/catalog-install'));
  assert.ok(routes.some(route=>route.path==='/api/plugin_finder/catalog-status'));
  for(const cleanup of effects.reverse())await cleanup?.();
  assert.equal(tools.size,0);assert.equal(new Set(closed).size,6);
});

test('entry routes fixed plan issues from both factories through the official default logger exporter and buffer',async t=>{
 const coreOptions=[],agentOptions=[],messages=[],effects=[];
 const logging=new Context(),disposeExporter=logging.logger.exporter({export:message=>messages.push(message)});
 t.after(async()=>{for(const cleanup of effects.reverse())await cleanup?.();await disposeExporter();await logging.fiber.dispose();});
 logging.logger.warn('default-warn-is-filtered');
 const warningCount=JSON.parse(await readFile(new URL('../node_modules/@deepseek-ai/cordis/package.json',import.meta.url),'utf8')).version==='4.1.0'?1:0;
 assert.equal(messages.length,warningCount);assert.equal(logging.logger.buffer.length,warningCount);
 const sdk={
  '@deepseek-ai/dsh-storage-domain':{defineDomain:spec=>spec,domainTable:schema=>schema},
  '@deepseek-ai/dsh-app-boot':{getDshRuntimeVersion:()=> '0.2.1-rc.5'},
  '@deepseek-ai/dsh-tools':{defineTool:definition=>definition},
  '@deepseek-ai/dsh-sandbox':{approveEscalation:async()=>assert.fail('no installation')},
 };
 const bundled=await build({entryPoints:[new URL('../index.js',import.meta.url).pathname],bundle:true,format:'cjs',platform:'node',external:['@deepseek-ai/*'],define:{'import.meta.url':JSON.stringify(new URL('../catalog/index.mjs',import.meta.url).href)},write:false,plugins:[{name:'capture-planning-factories',setup(builder){
  builder.onLoad({filter:/\/src\/service\.js$/},()=>({loader:'js',contents:'export function createFinderService(options){coreOptions.push(options);return {close(){},pendingTelemetry(){return []}}}'}));
  builder.onLoad({filter:/\/src\/agent-finder-service\.js$/},()=>({loader:'js',contents:'export class AgentFinderError extends Error {} export function createAgentFinderService(options){agentOptions.push(options);return {}}'}));
 }}]});
 const module={exports:{}};vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,coreOptions,agentOptions,require:id=>sdk[id]??require(id),Buffer,process:{versions:{node:process.versions.node},platform:process.platform},AbortController,AbortSignal,Response,Request,URL,TextDecoder,structuredClone,setTimeout,clearTimeout,console,fetch:()=>assert.fail('no network')});
 const ctx={logger:logging.logger,connection:{fetch:{register:()=>()=>{}}},tools:{register:()=>()=>{},get:()=>undefined,schemas:()=>[]},systemPrompt:{section:()=>()=>{}},workspaceRegistry:{list:()=>[]},workingDirectory:{get:()=>undefined},sandboxPolicy:{resolve:()=>({mode:'workspace-write'})},get(name){return this[name];},effect:fn=>effects.push(fn()),storageDomain:{open:async spec=>{const rows=new Map();return{table(){return{get:id=>rows.get(id),put:(id,row)=>rows.set(id,row),entries:()=>rows.entries()};},global:{get:()=>structuredClone(spec.global?.initial??null),set:()=>{}},close:async()=>{}};}}};
 await module.exports.apply(ctx);assert.equal(coreOptions.length,1);assert.equal(agentOptions.length,1);
 agentOptions[0].createCore({historyStore:{}});assert.equal(coreOptions.length,2);
 const issue={stage:'recommend.parse',path:'plan.steps[0].sourceCapability',type:'unknown-capability',raw:'PRIVATE_NEVER_LOG',unknownKey:'PRIVATE_UNKNOWN_KEY'};
 for(const options of coreOptions){assert.equal(typeof options.onPlanValidationIssue,'function');options.onPlanValidationIssue(issue);options.onPlanValidationIssue({...issue,path:'plan.PRIVATE_UNKNOWN_KEY'});}
 assert.equal(messages.length,warningCount+2);assert.equal(logging.logger.buffer.length,warningCount+2);
 assert.deepEqual(logging.logger.buffer.map(message=>message.args),messages.map(message=>message.args));
 for(const record of messages.slice(warningCount)){assert.equal(record.type,'info');assert.equal(record.level,warningCount?2:1);assert.equal(record.args.length,1);const message=record.args[0];assert.ok(message.startsWith('finder.plan_validation_issue '));assert.deepEqual(JSON.parse(message.slice('finder.plan_validation_issue '.length)),{stage:issue.stage,path:issue.path,type:issue.type});assert.doesNotMatch(message,/PRIVATE_/u);}
 delete ctx.logger;assert.doesNotThrow(()=>coreOptions[0].onPlanValidationIssue(issue));
});
