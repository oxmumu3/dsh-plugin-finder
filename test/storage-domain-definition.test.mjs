import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Real SDK boundary: @deepseek-ai/dsh-storage-domain src/spec.ts defineDomain
// enumerates Object.keys(spec.tables) at module evaluation, including globals.
// Exercise each actual entrypoint literal without importing SDKs or starting DSH.
test('every declared SDK storage domain supplies its required tables object',()=>{
 const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
 const definitions=[...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*defineDomain\(([\s\S]*?)\);/g)];
 assert.ok(definitions.length>=3,'legacy, history and telemetry domain declarations must be checked');
 const names=['state','workflow','historyPointer','historyRow','telemetryGlobal'];
 const values=names.map(()=>({}));
 for(const[,name,literal]of definitions){
  const spec=new Function('domainTable',...names,`return (${literal});`)(schema=>({schema}),...values);
  assert.doesNotThrow(()=>Object.keys(spec.tables),`${name} must satisfy the real SDK tables requirement`);
  assert.equal(typeof spec.tables,'object',`${name} tables must be an object`);
  assert.ok(spec.tables!==null&&!Array.isArray(spec.tables),`${name} tables must be a table declaration map`);
 }
});
