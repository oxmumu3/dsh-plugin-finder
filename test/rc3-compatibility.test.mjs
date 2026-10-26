import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('the install manifest permits the tested official rc.3 Host and peers',()=>{
 for(const [name,range]of Object.entries({'engines.dsh':pkg.engines.dsh,...pkg.peerDependencies}))assert.ok(range.split(/\s*\|\|\s*/).includes('0.2.1-rc.3'),name);
});
