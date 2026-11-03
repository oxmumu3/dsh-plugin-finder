import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readCatalogArchive} from '../src/catalog-archive.js';

const block=512;
function member(name,body='',{type='0',link='',checksumBad=false,size,magic='ustar\0',prefix=''}={}){
 const bytes=Buffer.isBuffer(body)?body:Buffer.from(body),header=Buffer.alloc(block);
 const text=(value,offset,length)=>Buffer.from(value).copy(header,offset,0,length);
 const octal=(value,offset,length)=>text(Number(value).toString(8).padStart(length-1,'0')+'\0',offset,length);
 text(name,0,100);octal(type==='5'?0o755:0o644,100,8);octal(0,108,8);octal(0,116,8);octal(size??bytes.length,124,12);octal(0,136,12);
 header.fill(0x20,148,156);text(type,156,1);text(link,157,100);text(magic,257,6);text('00',263,2);text(prefix,345,155);
 const checksum=[...header].reduce((a,b)=>a+b,0);text((checksumBad?checksum+1:checksum).toString(8).padStart(6,'0')+'\0 ',148,8);
 return Buffer.concat([header,bytes,Buffer.alloc((block-bytes.length%block)%block)]);
}
const tar=(rows,tail=Buffer.alloc(1024))=>Buffer.concat([...rows,tail]);
const archive=rows=>gzipSync(tar(rows));
const manifest=JSON.stringify({name:'dsh-agent-twin',version:'0.3.0',dsh:{bundle:{patch:'./cordis.patch.yml'}}});
const normal=()=>[member('package/','',{type:'5'}),member('package/package.json',manifest),member('package/cordis.patch.yml','[]\n')];
const rejects=(rows,tail)=>assert.throws(()=>readCatalogArchive(gzipSync(tar(rows,tail))));

test('portable tar reader returns only regular file bytes with package/ stripped',()=>{
 const files=readCatalogArchive(archive(normal()));assert.ok(files instanceof Map);assert.deepEqual([...files.keys()].sort(),['cordis.patch.yml','package.json']);assert.equal(files.get('package.json').toString(),manifest);assert.equal(files.get('cordis.patch.yml').toString(),'[]\n');
});
test('directory headers are never returned as a regular patch or source member',()=>{
 const files=readCatalogArchive(archive([...normal(),member('package/lib/','',{type:'5'}),member('package/lib/engine.js','export const n=1;')]));assert.equal(files.has('lib/'),false);assert.equal(files.has('lib'),false);assert.equal(files.get('lib/engine.js').toString(),'export const n=1;');
});
test('canonical path aliases, absolute paths, traversal and backslashes are rejected',()=>{
 for(const name of ['package//cordis.patch.yml','package/./cordis.patch.yml','package/../outside','/package/absolute','../package/outside','package\\outside','package/lib//x','package/lib/./x'])rejects([...normal(),member(name,'bad')]);
});
test('duplicate regular file names cannot silently replace a previously checked manifest or patch',()=>{
 for(const name of ['package/package.json','package/cordis.patch.yml'])rejects([...normal(),member(name,'replacement')]);
});
test('symlink, hardlink, device, fifo and extended metadata members are rejected',()=>{
 for(const type of ['1','2','3','4','6','x','g','L','K'])rejects([...normal(),member('package/link','',{type,link:'../../outside'})]);
});
test('header checksum is verified before trusting paths, type and size',()=>{
 rejects([member('package/package.json',manifest,{checksumBad:true}),member('package/cordis.patch.yml','[]')]);
});
test('declared oversized members or a truncated payload fail instead of returning partial bytes',()=>{
 rejects([member('package/package.json',manifest,{size:70*1024*1024})]);
 const headerAndMissing=member('package/package.json','x',{size:8192});assert.throws(()=>readCatalogArchive(gzipSync(headerAndMissing)));
});
test('invalid, truncated gzip and non-tar content are rejected',()=>{
 assert.throws(()=>readCatalogArchive(Buffer.from('not gzip')));const valid=archive(normal());assert.throws(()=>readCatalogArchive(valid.subarray(0,valid.length-7)));assert.throws(()=>readCatalogArchive(gzipSync(Buffer.from('not a tar archive'))));
});
test('nonzero trailing data cannot hide a second archive after the tar terminator',()=>{
 rejects(normal(),Buffer.concat([Buffer.alloc(1024),member('package/late.js','late') ,Buffer.alloc(1024)]));
});
test('compressed input is bounded by a 64 MiB decompressed budget',()=>{
 // This highly compressible payload is below the download byte cap but exceeds
 // the decompressed budget. Nothing is extracted or written to the filesystem.
 const bytes=gzipSync(Buffer.alloc(64*1024*1024+block));assert.ok(bytes.length<16*1024*1024);assert.throws(()=>readCatalogArchive(bytes));
});
test('more than 5000 archive members is refused before returning a catalog candidate',()=>{
 rejects(Array.from({length:5001},(_,index)=>member(`package/file-${index}.js`,'')));
});
test('case-insensitive filesystem aliases cannot override an already inspected member',()=>{
 rejects([...normal(),member('package/PACKAGE.JSON','replacement')]);
 rejects([...normal(),member('package/CORDIS.PATCH.YML','replacement')]);
});
test('Windows drive paths, alternate data streams and trailing-dot or space aliases are rejected',()=>{
 for(const name of ['package/C:/outside.js','package/index.js:stream','package/package.json.','package/package.json ','package/lib./index.js'])rejects([...normal(),member(name,'replacement')]);
});
test('Unicode-normalized aliases cannot become different members on disk',()=>{
 rejects([...normal(),member('package/caf\u00e9.js','first'),member('package/cafe\u0301.js','replacement')]);
});
