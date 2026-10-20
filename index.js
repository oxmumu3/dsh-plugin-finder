import {z} from 'zod';
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain';
import {getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
import {createDiscovery} from './src/discovery.js';
import {createHostModel} from './src/model.js';
import {createFinderService} from './src/service.js';
import {createFeedbackStore} from './src/feedback.js';
import {registerFinderRoutes} from './src/routes.js';
import {withOwnedDomain} from './src/lifecycle.js';
export const name='plugin-finder';
export const inject=['connection','storageDomain'];
const feedback=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),outcome:z.enum(['complete','partial','blocked']),pluginIds:z.array(z.string().max(200)).max(2),note:z.string().max(1500),stage:z.string().max(80)}).strict();
const state=z.object({id:z.literal('entries'),rows:z.array(feedback).max(100)}).strict();
const workflow=z.object({id:z.literal('current'),serialized:z.string().max(180000)}).strict();
const domain=defineDomain({name:'plugin_finder',version:1,tables:{feedback:domainTable(state),workflow:domainTable(workflow)}});
export async function apply(ctx){
  return withOwnedDomain(ctx,domain,async store=>{
  const table=store.table('feedback');
  const feedbackStore=createFeedbackStore({read:()=>table.get('entries'),write:row=>table.put('entries',state.parse(row))});
  const lifetime=new AbortController();
  const discovery=createDiscovery({market:()=>ctx.get('pluginMarket',false),signal:lifetime.signal});
  const workflowTable=store.table('workflow');
  const workflowStore={read:()=>workflowTable.get('current'),write:row=>workflowTable.put('current',workflow.parse(row)),clear:()=>workflowTable.delete('current')};
  const service=createFinderService({discovery,model:createHostModel(ctx),feedbackStore,workflowStore,hostVersion:getDshRuntimeVersion()});
  const stopRoutes=registerFinderRoutes(ctx,service);
  return()=>{stopRoutes();lifetime.abort();service.close();};
  });
}
