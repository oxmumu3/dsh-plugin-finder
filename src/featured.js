// Local-only, deterministic signals. Never read files, call a model, or send history.
export const featuredTopics = Object.freeze([
  {id:'twin', label:'AI 分身', keywords:['ai 分身','ai分身','数字分身','知识蒸馏','分身','agent twin','personal ai']},
  {id:'family', label:'家庭助手', keywords:['家庭','家人','长辈','亲人','family']},
  {id:'projects', label:'项目协作', keywords:['项目','任务交办','项目助理','工作区','任务管理','project','workspace']},
  {id:'connections', label:'工具连接', keywords:['连接','桥接','接入','互通','connector','bridge','harness','openai dot']},
].map(topic=>Object.freeze({...topic,keywords:Object.freeze(topic.keywords)})));

const productIds = new Set(['agent-twin','family-assistant','dsh-dot','dot-harness']);
const topicIds = new Set(featuredTopics.map(topic=>topic.id));
const topicLabels = new Map(featuredTopics.map(topic=>[topic.id,topic.label]));
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const boundedText = (value,max) => typeof value==='string' && value.length<=max ? value.trim() : '';
const boundedList = (value,max) => Array.isArray(value) ? value.slice(0,max) : [];
const allowedValues = (value,allowed) => [...new Set(boundedList(value,32).filter(item=>typeof item==='string'&&item.length<=80&&allowed.has(item)))];

export function normalizeFeaturedPreferences(value) {
  const input = object(value) && (value.version===undefined || value.version===1) ? value : {};
  return {version:1, interests:allowedValues(input.interests,topicIds), dismissed:allowedValues(input.dismissed,productIds)};
}

const normalized = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ');
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const topicPatterns = new Map(featuredTopics.map(topic=>[topic.id,topic.keywords.map(keyword=>{
  const value=normalized(keyword),pattern=escapePattern(value);
  return /^[a-z0-9 ]+$/u.test(value) ? new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`,'u') : new RegExp(pattern,'u');
})]));
const usableFeedback = row => row.lastFeedback==null || (object(row.lastFeedback)&&row.lastFeedback.type==='result'&&row.lastFeedback.outcome==='complete');
const exclusion = /不(?:需要|想要?|要|读取|读|做|使用|用|制作|创建|处理|包含|涉及|接入|连接)|无需|无须|排除|禁止|避免|\b(?:without|no|not|never|exclude|excluding|avoid|avoiding|don't|dont|cannot|can't)\b/u;
function positiveHistoryText(value) {
  // Drop explicitly negative clauses, including a topic placed before "not".
  // "without" introduces an excluded suffix. Other ambiguous clauses are omitted.
  return boundedText(value,6000).split(/[，,。！？!?；;\n\r]+|但是|但|\bbut\b|\.(?=\s|$)/iu).map(part=>{
    const clause=normalized(part),index=clause.search(/\bwithout\b/u);
    const prefix=index<0?clause:clause.slice(0,index);
    return exclusion.test(prefix)?'':prefix;
  }).join(' ');
}

function historyTopicCounts(history) {
  const tasks=new Map();
  // Repository summaries are newest first. Duplicate rows never amplify a task;
  // any conflicting negative result suppresses that task's history signal.
  for(const row of boundedList(history,100)) {
    if(!object(row))continue;
    const id=boundedText(row.taskId,200);if(!id)continue;
    const existing=tasks.get(id);
    if(existing){if(!usableFeedback(row))existing.usable=false;continue;}
    tasks.set(id,{row,usable:usableFeedback(row)});
  }
  const counts=new Map();
  for(const {row,usable} of tasks.values()) {
    if(!usable || row.stage!=='plan')continue;
    const text=`${positiveHistoryText(row.title)} ${positiveHistoryText(row.request)}`;
    for(const [topic,patterns] of topicPatterns) {
      if(patterns.some(pattern=>pattern.test(text)))counts.set(topic,Math.min(3,(counts.get(topic)??0)+1));
    }
  }
  return counts;
}

/** Returns at most three positive matches; reasons contain only fixed topic labels. */
export function rankFeatured(catalog, options={}) {
  const input=object(options)?options:{};
  const preferences=normalizeFeaturedPreferences(input.preferences);
  const interests=new Set(preferences.interests),dismissed=new Set(preferences.dismissed);
  const counts=historyTopicCounts(input.history),seen=new Set(),ranked=[];
  for(const [index,entry] of boundedList(catalog,50).entries()) {
    if(!object(entry)||!productIds.has(entry.id)||dismissed.has(entry.id)||seen.has(entry.id))continue;
    seen.add(entry.id);
    const topics=allowedValues(entry.topics,topicIds);
    const selected=topics.filter(topic=>interests.has(topic));
    const related=topics.filter(topic=>counts.has(topic));
    const score=selected.length*10+related.reduce((sum,topic)=>sum+counts.get(topic),0);
    if(score<=0)continue;
    const labels=(selected.length?selected:related).map(topic=>`「${topicLabels.get(topic)}」`).join('、');
    const reason=selected.length?`你选择了${labels}兴趣`:`保存的方案涉及${labels}`;
    ranked.push({entry,reason,score,index});
  }
  return ranked.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(({index,...item})=>item);
}

const verificationWindow=30*24*60*60*1000;
function recentTimestamp(value,now) {
  if(typeof value!=='string'||value.length>30||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/u.test(value))return false;
  const time=Date.parse(value);if(!Number.isFinite(time)||time>now||now-time>verificationWindow)return false;
  // Date.parse normalizes impossible dates such as February 30; reject those.
  const canonical=new Date(time).toISOString();
  return canonical.slice(0,10)===value.slice(0,10) && (value.length===10||canonical.slice(11,19)===value.slice(11,19));
}

function fixedPackageUrl(spec,version) {
  if(typeof spec!=='string'||spec.length>2048||spec!==spec.trim())return false;
  let url;try{url=new URL(spec);}catch{return false;}
  if(url.href!==spec||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return false;
  if(url.hostname==='github.com') {
    const match=/^\/([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,99})\/releases\/download\/([a-zA-Z0-9.-]+)\/([a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz)$/u.exec(url.pathname);
    return Boolean(match&&(match[3]===version||match[3]===`v${version}`)&&match[4].endsWith(`-${version}.tgz`));
  }
  if(url.hostname==='registry.npmjs.org') {
    const match=/^\/(?:@[a-z0-9][a-z0-9._-]*\/)?([a-z0-9][a-z0-9._-]*)\/-\/([a-z0-9][a-zA-Z0-9._-]*\.tgz)$/u.exec(url.pathname);
    return Boolean(match&&match[2]===`${match[1]}-${version}.tgz`);
  }
  return false;
}

/** Copyable fixed version only; failure leaves the catalog entry intact for details. */
export function safeFeaturedInstall(entry,now=Date.now()) {
  if(!object(entry)||entry.status!=='available'||!object(entry.install)||!Number.isFinite(now)||now<0)return null;
  const {spec,version,verifiedAt}=entry.install;
  if(typeof version!=='string'||version.length>100||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/u.test(version)||entry.version!==version)return null;
  if(!recentTimestamp(verifiedAt,now)||!recentTimestamp(entry.checkedAt,now)||!fixedPackageUrl(spec,version))return null;
  return {spec,version,verifiedAt};
}
