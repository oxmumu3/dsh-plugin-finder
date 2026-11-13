import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('the install manifest supports the exact tested rc.5, rc.1, rc.2 and rc.3 Hosts and all four exact SDK peers',()=>{
 const range='0.2.1-rc.5 || 0.2.2-rc.1 || 0.2.2-rc.2 || 0.2.2-rc.3';
 assert.equal(pkg.engines.dsh,range);
 assert.deepEqual(pkg.peerDependencies,{
  '@deepseek-ai/dsh-app-boot':range,
  '@deepseek-ai/dsh-storage-domain':range,
  '@deepseek-ai/dsh-tools':range,
  '@deepseek-ai/dsh-sandbox':range,
 });
});
