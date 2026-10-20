import {z} from 'zod';
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain';
import {getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
import {loadCatalog} from './catalog/index.mjs';
import {createHostModel} from './src/model.js';
import {createFinderService} from './src/service.js';
import {createFeedbackStore} from './src/feedback.js';
import {registerFinderRoutes} from './src/routes.js';
export const name='plugin-finder';
export const inject=['connection','storageDomain'];
const feedback=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),outcome:z.enum(['complete','partial','blocked']),pluginIds:z.array(z.string().max(200)).max(2),note:z.string().max(1500),stage:z.string().max(80)}).strict();
const state=z.object({id:z.literal('entries'),rows:z.array(feedback).max(100)}).strict();
const domain=defineDomain({name:'plugin_finder',version:1,tables:{feedback:domainTable(state)}});
export async function apply(ctx){
  const store=await ctx.storageDomain.open(domain),table=store.table('feedback');
  const feedbackStore=createFeedbackStore({read:()=>table.get('entries'),write:row=>table.put('entries',state.parse(row))});
  const service=createFinderService({catalog:await loadCatalog(),model:createHostModel(ctx),feedbackStore,hostVersion:getDshRuntimeVersion()});
  ctx.effect(()=>()=>service.close());
  registerFinderRoutes(ctx,service);
}
