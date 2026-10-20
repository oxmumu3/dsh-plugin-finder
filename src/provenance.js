const URL_FIELDS=new Set(['url','queryUrl','homepage','repository','otherRepository','registry']);
const SOURCE_ERROR='来源读取失败，请在宿主核对来源配置与网络。';

function publicUrl(value){
  if(!value)return value;
  try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return '';url.username='';url.password='';url.search='';url.hash='';return url.href;}
  catch{return '';}
}

// Apply only to provenance messages, never to the user's original task or
// install.spec: Git installation specs must retain their exact commit fragment.
export const publicSourceText=value=>typeof value==='string'?value.replace(/(?<![\w+])https?:\/\/[^\s<>"'`]+/g,url=>publicUrl(url)):value;

export function publicSourceData(value,key=''){
  if(typeof value==='string'){
    if(key==='error')return SOURCE_ERROR;
    if(URL_FIELDS.has(key))return publicUrl(value);
    if(key==='warnings')return publicSourceText(value);
    return value;
  }
  if(Array.isArray(value))return value.map(item=>publicSourceData(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,publicSourceData(item,name)]));
  return value;
}
