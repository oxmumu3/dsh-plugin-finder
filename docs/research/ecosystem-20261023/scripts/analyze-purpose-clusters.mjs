import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const data=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const full=JSON.parse(await fs.readFile(path.join(data,'plugins.json'),'utf8'));
const rules=[
  {id:'pomodoro',label:'番茄钟',category:null,fields:['name','description.zh','description.en'],pattern:'番茄(?:钟|工作|闹钟)|pomodoro|pomo(?:doro)?[-_ ]?timer',examples:['causebefore/dsh-pomodoro','yongfanbeta/dsh-pomodoro','slow-stack/dsh-study-desk']},
  {id:'usage-measurement',label:'用量与费用统计',category:'usage',fields:['name','description.zh','description.en'],pattern:'(?:token|令牌|用量|费用|成本).{0,8}(?:统计|计量|追踪|监控|聚合)|(?:统计|计量|追踪|监控|聚合).{0,8}(?:token|令牌|用量|费用|成本)|cost[-_ ]?meter|usage[-_ ]?(?:dashboard|monitor|tracker)|token[-_ ]?(?:counter|monitor)',examples:['0x7A7A6572/dsh-forge-studio/tree/main/packages/plugin-usage-billing','1569126506-sudo/dsh-team-cost','Han-1413141/dsh-cost-meter']},
  {id:'theme',label:'主题与皮肤',category:'theme',fields:['name','description.zh','description.en'],pattern:'主题|配色|皮肤|theme|skin',examples:['AaronKate/dsh-codex-appearance','acdsh4869/dsh-aqua-theme','Aliww2468/dsh-client-ui-aqua-patched']},
  {id:'sidebar-named',label:'名称指向侧栏的 UI 插件',category:'ui',fields:['name'],pattern:'sidebar|side-bar|侧栏|侧边栏',examples:['ACGsu/dsh-sidebar-panel-fold','All3nCN/dsh-better-sidebar-N23','e2mcc/dsh-popout-sidebar']},
];
const value=(row,field)=>field.split('.').reduce((v,key)=>v?.[key],row)??'';
const clusters=rules.map(rule=>{
  const regex=new RegExp(rule.pattern,'iu');
  const rows=full.plugins.filter(row=>(!rule.category||row.category===rule.category)&&rule.fields.some(field=>regex.test(value(row,field))));
  const examples=rule.examples.map(suffix=>{const row=rows.find(row=>row.url.toLowerCase()===('https://github.com/'+suffix).toLowerCase());if(!row)throw Error('Selected example does not meet explicit cluster rule: '+suffix);return{id:row.url,name:row.name,owner:row.owner,category:row.category,description:row.description.zh};});
  return{...rule,flags:'iu',count:rows.length,examples,members:rows.map(row=>({url:row.url,name:row.name,owner:row.owner}))};
});
const result={schemaVersion:1,source:'plugins.json',sourceUpdated:full.updated,denominator:full.plugins.length,method:'Each regular expression is tested independently on the named fields; category is an additional filter. Groups may overlap. No code, installed behavior, dependency compatibility or intellectual provenance was compared.',interpretation:'Keyword-selected purpose neighborhoods, not exact functional duplicates or a functional duplication rate. Missing keywords do not imply unique purpose; matched descriptions can refer to one feature inside a larger product.',clusters};
await fs.writeFile(path.join(data,'purpose-clusters.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(clusters.map(({id,count,examples})=>({id,count,examples:examples.map(e=>e.url??e.id)}))));
