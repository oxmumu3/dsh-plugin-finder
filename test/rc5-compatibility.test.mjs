import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('the install manifest supports only the tested official rc.5 Host and all four exact SDK peers',()=>{
 assert.equal(pkg.engines.dsh,'0.2.1-rc.5');
 assert.deepEqual(pkg.peerDependencies,{
  '@deepseek-ai/dsh-app-boot':'0.2.1-rc.5',
  '@deepseek-ai/dsh-storage-domain':'0.2.1-rc.5',
  '@deepseek-ai/dsh-tools':'0.2.1-rc.5',
  '@deepseek-ai/dsh-sandbox':'0.2.1-rc.5',
 });
});
