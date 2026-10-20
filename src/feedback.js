import {FinderError} from './contracts.js';
export function createFeedbackStore({read,write}){
  let pending=Promise.resolve();
  const list=async()=>{const data=await read();return structuredClone(Array.isArray(data?.rows)?data.rows:[]);};
  return{
    append(row){const operation=pending.then(async()=>{try{const rows=await list();rows.push(structuredClone(row));await write({id:'entries',rows:rows.slice(-100)});}catch{throw new FinderError('STORAGE_FAILED');}});pending=operation.catch(()=>{});return operation;},
    async list(){await pending;return list();}
  };
}
