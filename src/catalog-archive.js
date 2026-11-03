import {gunzipSync} from 'node:zlib';

const fail=()=>{throw Error('Invalid published plugin archive');};
/** Inspect fixed release bytes in memory on every supported OS; never extract or execute files. */
export function readCatalogArchive(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>16*1024*1024)fail();
 const tar=gunzipSync(bytes,{maxOutputLength:64*1024*1024}),files=new Map(),paths=new Set();
 const field=(header,start,length)=>header.subarray(start,start+length).toString('utf8').split('\0')[0];
 const octal=value=>/^[0-7]+$/.test(value.trim())?Number.parseInt(value.trim(),8):fail();
 let offset=0,ended=false;
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512);offset+=512;
  if(header.every(byte=>byte===0)){if(tar.subarray(offset).some(byte=>byte!==0))fail();ended=true;break;}
  const checksum=octal(field(header,148,8)),actual=header.reduce((sum,byte,i)=>sum+(i>=148&&i<156?32:byte),0);
  if(checksum!==actual)fail();
  const prefix=field(header,345,155),name=(prefix?prefix+'/':'')+field(header,0,100),type=field(header,156,1),size=octal(field(header,124,12));
  if(!['','0','5'].includes(type)||!Number.isSafeInteger(size)||size<0||size>16*1024*1024||offset+size>tar.length||!name.startsWith('package/')||name.includes('\\')||/[\x00-\x1f\x7f]/.test(name))fail();
  const canonical=name.endsWith('/')?name.slice(0,-1):name;
  const key=canonical.normalize('NFC').toLowerCase();
  if(canonical.length>1500||canonical.includes('\uFFFD')||canonical.split('/').some(part=>!part||part==='.'||part==='..'||part.includes(':')||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))||paths.has(key)||paths.size>=5000)fail();
  paths.add(key);
  if(type==='5'){if(size||!name.endsWith('/'))fail();}
  else{
   if(name.endsWith('/')||canonical==='package')fail();
   files.set(canonical.slice('package/'.length),Buffer.from(tar.subarray(offset,offset+size)));
  }
  offset+=Math.ceil(size/512)*512;
 }
 if(!ended||!files.size)fail();
 return files;
}
