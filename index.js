import {z} from 'zod';
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain';
import {getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
import {createDiscovery} from './src/discovery.js';
import {createHostModel} from './src/model.js';
import {createFinderService} from './src/service.js';
import {createFeedbackStore} from './src/feedback.js';
import {registerFinderRoutes} from './src/routes.js';
import {withOwnedDomains} from './src/lifecycle.js';
import {createTelemetry} from './src/telemetry.js';
import {withTelemetryApi} from './src/telemetry-api.js';
import {COLLECTOR_URL,CLIENT_VERSION} from './src/telemetry-config.js';
import {createRuntimeContextReader} from './src/runtime-context.js';
import {createPluginInstaller,createPluginInventoryReader} from './src/plugin-installation.js';
import {createCatalogDetailResolver,catalogArchiveRoot,catalogEntryRevision} from './src/catalog-detail.js';
import {createCatalogInventoryReader} from './src/catalog-inventory.js';
import {createCatalogInstallService} from './src/catalog-install-service.js';
import {withOpportunityApi} from './src/opportunity-api.js';
import {createOpportunityContextReader} from './src/opportunity-context.js';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {approveEscalation} from '@deepseek-ai/dsh-sandbox';
import {createAgentFinderService} from './src/agent-finder-service.js';
import {registerAgentTools} from './src/agent-tools.js';
import {mergeRecent} from './src/search-history.js';
import {createGeneratedPluginInstaller,createGeneratedArtifactReviewer} from './src/agent-created-installation.js';
import {createAgentModelAdapter} from './src/agent-model.js';
import {safePlanValidationIssue} from './src/contracts.js';
export const name='plugin-finder';
export const inject=['connection','storageDomain','tools','systemPrompt','workspaceRegistry','workingDirectory','sandboxPolicy'];
const feedback=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),outcome:z.enum(['complete','partial','blocked']),pluginIds:z.array(z.string().max(200)).max(4),note:z.string().max(1500),stage:z.string().max(80)}).strict();
const state=z.object({id:z.literal('entries'),rows:z.array(feedback).max(100)}).strict();
const workflow=z.object({id:z.literal('current'),serialized:z.string().max(180000)}).strict();
const domain=defineDomain({name:'plugin_finder',version:1,tables:{feedback:domainTable(state),workflow:domainTable(workflow)}});
const historyRow=z.object({id:z.string().min(1).max(200),serialized:z.string().max(8256000)}).strict();
const historyPointer=z.object({activeTaskId:z.string().min(1).max(200).nullable(),activeRevisionId:z.string().min(1).max(200).nullable()}).strict();
// A separate domain preserves the legacy version-1 medium and its unlinked feedback.
const historyDomain=defineDomain({name:'plugin_finder_history',version:1,global:{schema:historyPointer,initial:{activeTaskId:null,activeRevisionId:null}},tables:{tasks:domainTable(historyRow)}});
const telemetryGlobal=z.object({serialized:z.string().max(2000000)}).strict();
const telemetryDomain=defineDomain({name:'plugin_finder_telemetry',version:1,tables:{},global:{schema:telemetryGlobal,initial:{serialized:'null'}}});
const opportunityDomain=defineDomain({name:'plugin_finder_opportunities',version:1,tables:{},global:{schema:telemetryGlobal,initial:{serialized:'null'}}});
// Agent requests never share the human workbench's active pointer or telemetry consent.
const agentRequestRow=z.object({id:z.string().min(1).max(200),serialized:z.string().max(8000000)}).strict();
const agentRequestDomain=defineDomain({name:'plugin_finder_agent_requests',version:1,tables:{requests:domainTable(agentRequestRow)}});
const catalogInstallRow=z.object({id:z.string().min(1).max(200),serialized:z.string().max(256000)}).strict();
const catalogInstallDomain=defineDomain({name:'plugin_finder_catalog_installs',version:1,tables:{installations:domainTable(catalogInstallRow)}});
const searchSource=z.object({id:z.string().min(1).max(200),title:z.string().max(300),status:z.string().max(40),total:z.number().int().nonnegative(),used:z.number().int().nonnegative()}).strict();
const searchRecord=z.object({id:z.string().min(1).max(200),request:z.string().max(6000),searchedAt:z.string().datetime(),sources:z.array(searchSource).max(16),totals:z.object({read:z.number().int().nonnegative(),used:z.number().int().nonnegative(),failed:z.number().int().nonnegative()}).strict(),planKind:z.enum(['native','single','combo','gap','hybrid']),planTitle:z.string().max(500),recordVersion:z.literal(1)}).strict();
// 检索留痕单独成域：只保存压平后的摘要，不触碰任务历史或遥测指针。
const searchHistoryDomain=defineDomain({name:'plugin_finder_search',version:1,tables:{records:domainTable(searchRecord)}});
export async function apply(ctx){
  return withOwnedDomains(ctx,[domain,historyDomain,telemetryDomain,opportunityDomain,agentRequestDomain,catalogInstallDomain,searchHistoryDomain],async([store,historyStoreHandle,telemetryHandle,opportunityHandle,agentHandle,catalogHandle,searchHistoryHandle])=>{
  const table=store.table('feedback');
  const feedbackStore=createFeedbackStore({read:()=>table.get('entries'),write:row=>table.put('entries',state.parse(row))});
  const lifetime=new AbortController();
  const discovery=createDiscovery({market:()=>ctx.get('pluginMarket',false),signal:lifetime.signal});
  const workflowTable=store.table('workflow');
  const workflowStore={read:()=>workflowTable.get('current'),write:row=>workflowTable.put('current',workflow.parse(row)),clear:()=>workflowTable.delete('current')};
  const tasks=historyStoreHandle.table('tasks');
  const historyStore={read:id=>tasks.get(id),write:row=>tasks.put(row.id,historyRow.parse(row)),list:()=>[...tasks.entries()].map(([,row])=>row),readPointer:()=>historyStoreHandle.global.get(),writePointer:value=>historyStoreHandle.global.set(historyPointer.parse(value))};
  const searchRecords=searchHistoryHandle.table('records');
  const searchHistoryStore={
    list:()=>[...searchRecords.entries()].map(([,row])=>row),
    async save(record){
      const rows=mergeRecent(searchHistoryStore.list(),record);
      const keep=new Set(rows.map(row=>row.id));
      for(const row of rows)searchRecords.put(row.id,searchRecord.parse(row));
      for(const [id] of [...searchRecords.entries()])if(!keep.has(id))searchRecords.delete(id);
    },
  };
  let core;
  const telemetryStore={read:async()=>JSON.parse((await telemetryHandle.global.get()).serialized),write:value=>telemetryHandle.global.set({serialized:JSON.stringify(value)})};
  const telemetry=createTelemetry({store:telemetryStore,endpoint:COLLECTOR_URL,listPending:epoch=>core.pendingTelemetry(epoch),clientVersion:CLIENT_VERSION,hostVersion:getDshRuntimeVersion()});
  const model=createHostModel(ctx);
  const onPlanValidationIssue=issue=>{const safe=safePlanValidationIssue(issue);if(safe)try{ctx.logger?.info?.('finder.plan_validation_issue '+JSON.stringify(safe));}catch{}};
  core=createFinderService({discovery,model,feedbackStore,workflowStore,historyStore,searchHistoryStore,telemetry,onPlanValidationIssue,hostVersion:getDshRuntimeVersion(),runtimeContext:createRuntimeContextReader(ctx,{signal:lifetime.signal}),preparePlugins:createPluginInstaller(ctx,{signal:lifetime.signal})});
  const opportunityStore={read:async()=>JSON.parse((await opportunityHandle.global.get()).serialized),write:value=>opportunityHandle.global.set({serialized:JSON.stringify(value)})};
  const archiveRoot=catalogArchiveRoot(ctx),installations=catalogHandle.table('installations');
  const catalogService=createCatalogInstallService({
    store:{read:id=>installations.get(id),write:row=>installations.put(row.id,catalogInstallRow.parse(row)),list:()=>[...installations.entries()].map(([,row])=>row)},
    resolveDetail:createCatalogDetailResolver({discovery,hostVersion:getDshRuntimeVersion(),nodeVersion:process.versions.node,platform:process.platform,archiveRoot,archiveHome:archiveRoot?ctx.get('profileContext',false)?.home:undefined,signal:lifetime.signal}),
    preparePlugins:createPluginInstaller(ctx,{signal:lifetime.signal,archiveRoot}),
    readInstalled:createPluginInventoryReader(ctx,{archiveRoot}),
    readEntryInstalled:createCatalogInventoryReader(ctx),entryRevision:catalogEntryRevision,
  });
  const service={...withOpportunityApi(withTelemetryApi(core,telemetry),{model,store:opportunityStore,historyStore,readWorkspaceContext:createOpportunityContextReader(ctx,{signal:lifetime.signal})}),
    catalogDetail:body=>catalogService.detail(body),catalogInstall:body=>catalogService.install(body),catalogStatus:body=>catalogService.status(body)};
  const requests=agentHandle.table('requests');
  const agentModel=createAgentModelAdapter(model,{readRuntime:createRuntimeContextReader(ctx,{signal:lifetime.signal})});
  const agentService=createAgentFinderService({
    readInstalled:createPluginInventoryReader(ctx,{archiveRoot}),
    store:{read:id=>requests.get(id),write:row=>requests.put(row.id,agentRequestRow.parse(row))},
    createCore:({historyStore:requestHistory})=>createFinderService({
      historyStore:requestHistory,
      searchHistoryStore,
      model:agentModel,
      onPlanValidationIssue,
      discovery:{search:request=>discovery.search(request),searchSelected:request=>discovery.searchSelected(request)},
      hostVersion:getDshRuntimeVersion(),runtimeContext:createRuntimeContextReader(ctx,{signal:lifetime.signal}),
    }),
    searchOnly:(input,searchOptions)=>core.searchOnly(input,searchOptions),
    preparePlugins:createPluginInstaller(ctx,{signal:lifetime.signal}),
    prepareGeneratedPlugins:createGeneratedPluginInstaller(ctx,{signal:lifetime.signal}),
    reviewGeneratedArtifact:createGeneratedArtifactReviewer(ctx,{signal:lifetime.signal}),
  });
  const stopAgentTools=registerAgentTools(ctx,agentService,{defineTool,approveEscalation,signal:lifetime.signal});
  telemetry.committed();
  const stopRoutes=registerFinderRoutes(ctx,service);
  return async()=>{
    lifetime.abort();
    try{stopRoutes();}finally{
      try{await stopAgentTools();}finally{try{await catalogService.close();}finally{service.close();discovery.close();}}
    }
  };
  });
}
