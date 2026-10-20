import {z} from 'zod';
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain';
import {getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
import {createDiscovery} from './src/discovery.js';
import {createHostModel} from './src/model.js';
import {createFinderService} from './src/service.js';
import {createFeedbackStore} from './src/feedback.js';
import {registerFinderRoutes} from './src/routes.js';
import {withOwnedDomains} from './src/lifecycle.js';
export const name='plugin-finder';
export const inject=['connection','storageDomain'];
const feedback=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),outcome:z.enum(['complete','partial','blocked']),pluginIds:z.array(z.string().max(200)).max(2),note:z.string().max(1500),stage:z.string().max(80)}).strict();
const state=z.object({id:z.literal('entries'),rows:z.array(feedback).max(100)}).strict();
const workflow=z.object({id:z.literal('current'),serialized:z.string().max(180000)}).strict();
const domain=defineDomain({name:'plugin_finder',version:1,tables:{feedback:domainTable(state),workflow:domainTable(workflow)}});
const historyRow=z.object({id:z.string().min(1).max(200),serialized:z.string().max(8000000)}).strict();
const historyPointer=z.object({activeTaskId:z.string().min(1).max(200).nullable(),activeRevisionId:z.string().min(1).max(200).nullable()}).strict();
// A separate domain preserves the legacy version-1 medium and its unlinked feedback.
const historyDomain=defineDomain({name:'plugin_finder_history',version:1,global:{schema:historyPointer,initial:{activeTaskId:null,activeRevisionId:null}},tables:{tasks:domainTable(historyRow)}});
export async function apply(ctx){
  return withOwnedDomains(ctx,[domain,historyDomain],async([store,historyStoreHandle])=>{
  const table=store.table('feedback');
  const feedbackStore=createFeedbackStore({read:()=>table.get('entries'),write:row=>table.put('entries',state.parse(row))});
  const lifetime=new AbortController();
  const discovery=createDiscovery({market:()=>ctx.get('pluginMarket',false),signal:lifetime.signal});
  const workflowTable=store.table('workflow');
  const workflowStore={read:()=>workflowTable.get('current'),write:row=>workflowTable.put('current',workflow.parse(row)),clear:()=>workflowTable.delete('current')};
  const tasks=historyStoreHandle.table('tasks');
  const historyStore={read:id=>tasks.get(id),write:row=>tasks.put(row.id,historyRow.parse(row)),list:()=>[...tasks.entries()].map(([,row])=>row),readPointer:()=>historyStoreHandle.global.get(),writePointer:value=>historyStoreHandle.global.set(historyPointer.parse(value))};
  const service=createFinderService({discovery,model:createHostModel(ctx),feedbackStore,workflowStore,historyStore,hostVersion:getDshRuntimeVersion()});
  const stopRoutes=registerFinderRoutes(ctx,service);
  return()=>{stopRoutes();lifetime.abort();service.close();};
  });
}
