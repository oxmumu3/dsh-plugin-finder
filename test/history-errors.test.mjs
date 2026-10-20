import test from 'node:test';
import assert from 'node:assert/strict';
import {FinderError} from '../src/contracts.js';

test('history failures tell the user whether records were preserved and never use a generic model error',()=>{
  for(const [code,status,words] of [
    ['HISTORY_STORAGE_FAILED',500,/保存.*记录|记录.*保留/],
    ['HISTORY_CAPACITY',413,/容量|空间/],
    ['STALE_WORKFLOW',409,/版本|任务/],
    ['WORKFLOW_NOT_FOUND',404,/记录|方案/],
    ['INVALID_BACKUP',400,/备份/],
  ]){
    const error=new FinderError(code);assert.equal(error.status,status,code);assert.match(error.message,words,code);assert.doesNotMatch(error.message,/宿主模型调用未完成/,code);
  }
});
