import test from 'node:test';
import assert from 'node:assert/strict';
import {featuredTopics, normalizeFeaturedPreferences, rankFeatured, safeFeaturedInstall} from '../src/featured.js';

const now = Date.parse('2026-10-22T12:00:00.000Z');
const stamp = '2026-10-22T00:00:00.000Z';
const version = '0.4.0-preview.1';
const spec = `https://github.com/oxmumu3/dsh-agent-twin/releases/download/v${version}/dsh-agent-twin-${version}.tgz`;
const available = {id:'agent-twin', title:'AI 分身', topics:['twin'], status:'available', version, checkedAt:stamp, install:{spec, version, verifiedAt:stamp}};
const catalog = [available, {id:'family-assistant', title:'家庭助手', topics:['family'], status:'preview', install:null}, {id:'dsh-dot', title:'项目助理', topics:['projects'], status:'private', install:null}, {id:'dot-harness', title:'连接 Harness', topics:['connections'], status:'preview', install:null}];
const history = (request, extra={}) => ({taskId:'task-1', title:'保存的方案', request, stage:'plan', lastFeedback:null, ...extra});
const ids = result => result.map(item=>item.entry.id);
const freeze = value => {if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('topics provide the four fixed interests with bounded matching words',()=>{
  assert.deepEqual(featuredTopics.map(item=>item.id), ['twin','family','projects','connections']);
  for(const topic of featuredTopics){assert.equal(typeof topic.label,'string');assert.ok(topic.keywords.length>0);assert.ok(topic.keywords.every(word=>typeof word==='string'&&word.length<100));}
});
test('normalization allows only known interests and dismissible product IDs',()=>{
  assert.deepEqual(normalizeFeaturedPreferences({version:1, interests:['twin','twin','family','unknown',{},'agent-twin'], dismissed:['agent-twin','agent-twin','dot-harness','twin','unknown'], privateText:'not retained'}),{version:1, interests:['twin','family'], dismissed:['agent-twin','dot-harness']});
});
test('malformed preferences and unsupported versions reset safely',()=>{
  for(const value of [null,undefined,[],true,'{}',0,{version:2,interests:['twin']},{version:'1',interests:['twin']}]) assert.deepEqual(normalizeFeaturedPreferences(value),{version:1,interests:[],dismissed:[]});
  assert.deepEqual(normalizeFeaturedPreferences({interests:'twin',dismissed:{}}),{version:1,interests:[],dismissed:[]});
  assert.deepEqual(normalizeFeaturedPreferences({interests:['twin']}),{version:1,interests:['twin'],dismissed:[]});
});
test('cold start and unrelated saved work produce no personal recommendations',()=>{
  assert.deepEqual(rankFeatured(catalog),[]);
  assert.deepEqual(rankFeatured(catalog,{history:[history('把表格的数值相加')]}),[]);
});
test('explicit interests recommend matching entries and explain only selected topics',()=>{
  const ranked=rankFeatured(catalog,{preferences:{interests:['family']}});
  assert.deepEqual(ids(ranked),['family-assistant']);assert.ok(ranked[0].score>0);assert.match(ranked[0].reason,/选择|兴趣/);assert.match(ranked[0].reason,/家庭/);
});
test('saved plans can match without claiming selection, liking, or successful use',()=>{
  const ranked=rankFeatured(catalog,{history:[history('PRIVATE NAME 937: 帮我的家人整理每日日报') ]});
  assert.deepEqual(ids(ranked),['family-assistant']);assert.match(ranked[0].reason,/保存的方案涉及/);assert.match(ranked[0].reason,/家庭/);assert.doesNotMatch(ranked[0].reason,/PRIVATE|937|每日日报|喜欢|成功|完成|用过/);
});
test('matching recognizes English words but does not match arbitrary substrings',()=>{
  assert.deepEqual(ids(rankFeatured(catalog,{history:[history('Plan a FAMILY assistant')]})),['family-assistant']);
  assert.deepEqual(rankFeatured(catalog,{history:[history('projector dots bridgewater familyname')]}),[]);
});
test('a dot file or standalone dot is not evidence of a tool connection',()=>{
  for(const request of ['把 Graphviz 的 .dot 文件转换成 SVG 图片','Render the dot graph','打开 dot 文件']) assert.deepEqual(rankFeatured(catalog,{history:[history(request)]}),[]);
  assert.deepEqual(ids(rankFeatured(catalog,{history:[history('使用 OpenAI Dot 读取授权资料')]})),['dot-harness']);
});
test('explicit Chinese exclusions do not turn family or twin topics into recommendations',()=>{
  for(const request of ['只分析项目，不读取家人资料，也不要制作 AI 分身','只做项目协作但不需要家庭助手也不要 AI 分身','只处理项目，不做家庭助手，不读取家人资料，不需要分身','不需要家庭助手，只做项目协作','处理项目；排除家庭助手和 AI 分身']) {
    assert.deepEqual(ids(rankFeatured(catalog,{history:[history(request)]})),['dsh-dot'],request);
  }
});
test('English without, no, and exclude clauses do not add excluded topic signals',()=>{
  for(const request of ['Plan a project assistant without family data or an agent twin','Manage a project, no family or agent twin','Manage a project; exclude family data and personal AI','Do not create an agent twin, manage this project','Manage this project but do not use family data']) {
    assert.deepEqual(ids(rankFeatured(catalog,{history:[history(request)]})),['dsh-dot'],request);
  }
});
test('uncertain positive text after an exclusion may be omitted while explicit interests remain independent',()=>{
  assert.deepEqual(rankFeatured(catalog,{history:[history('不要家庭助手和 AI 分身并处理项目')]}),[]);
  const preferences={interests:['family','twin']};
  assert.deepEqual(rankFeatured(catalog,{preferences,history:[history('不需要家庭助手或 AI 分身')]}),rankFeatured(catalog,{preferences}));
});
test('exclusions in a saved plan title cannot become positive signals',()=>{
  assert.deepEqual(rankFeatured(catalog,{history:[history('整理表格',{title:'不读取家人资料，也不制作 AI 分身'})]}),[]);
});
test('an excluded topic before a negation is also removed conservatively',()=>{
  for(const request of ['家庭助手不需要，AI 分身不要，只做项目协作','Family assistance is not needed; manage a project','项目与家人资料不处理']) {
    assert.deepEqual(ids(rankFeatured(catalog,{history:[history(request)]})),request.includes('项目与')?[]:['dsh-dot'],request);
  }
});
test('a request still being understood does not count as a saved plan',()=>{
  assert.deepEqual(rankFeatured(catalog,{history:[history('家庭助手',{stage:'understand'})]}),[]);
});
test('real complete feedback allows relevance without inferring a product endorsement',()=>{
  const ranked=rankFeatured(catalog,{history:[history('AI 分身',{lastFeedback:{type:'result',outcome:'complete',note:'PRIVATE'}})]});
  assert.deepEqual(ids(ranked),['agent-twin']);assert.doesNotMatch(ranked[0].reason,/喜欢|PRIVATE/);
});
test('partial, blocked, failed, and unrecognized feedback never add positive evidence',()=>{
  for(const outcome of ['partial','blocked','failed','completed','unknown',null]) assert.deepEqual(rankFeatured(catalog,{history:[history('家庭助手',{lastFeedback:{type:'result',outcome}})]}),[]);
});
test('negative feedback cannot cancel an independently declared interest',()=>{
  const preferences={interests:['family']};
  assert.deepEqual(rankFeatured(catalog,{preferences,history:[history('家庭助手',{lastFeedback:{type:'result',outcome:'blocked'}})]}),rankFeatured(catalog,{preferences}));
});
test('refinement or malformed lastFeedback is not positive history evidence',()=>{
  for(const lastFeedback of [{type:'refinement',outcome:null},{type:'wrong',outcome:'complete'},'complete',{}]) assert.deepEqual(rankFeatured(catalog,{history:[history('家庭助手',{lastFeedback})]}),[]);
});
test('dismissing a product immediately excludes it regardless of interest or history',()=>{
  assert.deepEqual(rankFeatured(catalog,{preferences:{interests:['family'],dismissed:['family-assistant']},history:[history('家庭助手')]}),[]);
});
test('duplicate task IDs do not multiply evidence and a failed duplicate is conservative',()=>{
  const row=history('家庭助手');
  assert.deepEqual(rankFeatured(catalog,{history:[row,row,row]}),rankFeatured(catalog,{history:[row]}));
  assert.deepEqual(rankFeatured(catalog,{history:[row,{...row,lastFeedback:{type:'result',outcome:'blocked'}}]}),[]);
});
test('equal scores retain catalog order and recommendations stop at three',()=>{
  assert.deepEqual(ids(rankFeatured(catalog,{preferences:{interests:['connections','projects','family','twin']}})),['agent-twin','family-assistant','dsh-dot']);
});
test('invalid and oversized history values do not supply evidence',()=>{
  for(const row of [null,{},history('家庭助手',{taskId:''}),history('家庭助手',{taskId:'x'.repeat(201)}),history('家庭助手'.repeat(2000))]) assert.deepEqual(rankFeatured(catalog,{history:[row]}),[]);
  assert.deepEqual(rankFeatured(catalog,{history:Array(100).fill(null).concat(history('家庭助手'))}),[]);
  assert.deepEqual(rankFeatured(catalog,{history:'家庭助手'}),[]);
  assert.deepEqual(rankFeatured(null,{preferences:{interests:['twin']}}),[]);
});
test('unknown catalog products and invalid topic declarations cannot be recommended',()=>{
  assert.deepEqual(rankFeatured([{id:'unexpected',topics:['family']},{id:'family-assistant',topics:'family'},null],{preferences:{interests:['family']}}),[]);
});
test('the pure API neither mutates nor requires mutable caller data',()=>{
  const input=freeze({catalog:structuredClone(catalog),options:{history:[history('家庭助手')],preferences:{interests:['twin'],dismissed:[]}}});
  const before=structuredClone(input);rankFeatured(input.catalog,input.options);normalizeFeaturedPreferences(input.options.preferences);safeFeaturedInstall(input.catalog[0],now);assert.deepEqual(input,before);
});
test('a checked fixed-version GitHub release returns only the safe install fields',()=>{
  assert.deepEqual(safeFeaturedInstall({...available,install:{...available.install,command:'do not copy'}},now),{spec,version,verifiedAt:stamp});
  assert.notEqual(safeFeaturedInstall(available,now),available.install);
});
test('a checked fixed-version npm registry tarball is supported',()=>{
  const npmSpec=`https://registry.npmjs.org/dsh-agent-twin/-/dsh-agent-twin-${version}.tgz`;
  assert.equal(safeFeaturedInstall({...available,install:{...available.install,spec:npmSpec}},now)?.spec,npmSpec);
  const scoped=`https://registry.npmjs.org/@oxmumu3/dsh-agent-twin/-/dsh-agent-twin-${version}.tgz`;
  assert.equal(safeFeaturedInstall({...available,install:{...available.install,spec:scoped}},now)?.spec,scoped);
});
test('preview, private, absent, or mismatched install metadata disables copying',()=>{
  for(const value of [null,{}, {...available,status:'preview'},{...available,status:'private'},{...available,install:null},{...available,version:'0.3.0'},{...available,install:{...available.install,version:'latest'}}]) assert.equal(safeFeaturedInstall(value,now),null);
});
test('malicious, mutable, unrelated, and noncanonical URLs disable copying',()=>{
  const urls=[`http${spec.slice(5)}`,spec.replace('github.com','localhost'),spec.replace('github.com','127.0.0.1'),spec.replace('github.com','github.com.evil.test'),spec.replace('github.com','user:pass@github.com'),spec.replace('github.com','github.com:444'),spec.replace('github.com','github.com:443'),spec.replace('https://','HTTPS://'),`${spec}?download=1`,`${spec}#x`,spec.replace(`/v${version}/`,'/latest/'),spec.replace('/releases/download/','/arbitrary/'),spec.replace(`-${version}.tgz`,'-0.2.0.tgz'),spec.replace('/dsh-agent-twin/releases','/%2e%2e/dsh-agent-twin/releases'),`javascript:alert(1)`,`https://registry.npmjs.org/dsh-agent-twin`, `https://registry.npmjs.org/dsh-agent-twin/-/other-${version}.tgz`, `https://example.com/asset-${version}.tgz`,`${spec}\n`, spec.replace('/releases/','/foo/../releases/')];
  for(const value of urls) assert.equal(safeFeaturedInstall({...available,install:{...available.install,spec:value}},now),null,value);
});
test('verification and source-check dates must be valid, recent, and not in the future',()=>{
  for(const date of [null,'','not-a-date','2026-02-30T00:00:00Z','2026-10-22T25:00:00Z','2026-10-23T00:00:00Z','2026-09-01T00:00:00Z',42]){
    assert.equal(safeFeaturedInstall({...available,install:{...available.install,verifiedAt:date}},now),null,String(date));
    assert.equal(safeFeaturedInstall({...available,checkedAt:date},now),null,String(date));
  }
  const boundary=new Date(now-30*24*60*60*1000).toISOString();
  assert.ok(safeFeaturedInstall({...available,checkedAt:boundary,install:{...available.install,verifiedAt:boundary}},now));
  assert.equal(safeFeaturedInstall(available,NaN),null);
  assert.ok(safeFeaturedInstall({...available,checkedAt:'2026-10-22'},now));
});
