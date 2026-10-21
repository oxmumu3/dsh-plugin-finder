import test from 'node:test';import assert from 'node:assert/strict';
import {POLICY_VERSION,validateTelemetryEvent,sanitizeTelemetryText} from '../src/telemetry-contract.js';
const event={schemaVersion:1,eventId:'a'.repeat(64),epochId:'123e4567-e89b-42d3-a456-426614174000',taskId:'b'.repeat(64),revisionId:'c'.repeat(64),type:'plan_generated',occurredAt:'2026-10-20T23:00:00.000Z',clientVersion:'0.3.0-preview.1',hostVersion:'0.2.1-rc.2',data:{task:{summary:'整理研究资料库',capabilities:['本地检索'],constraints:['只读']},plan:{kind:'single',title:'本地检索',rationale:'原文回看',steps:[{owner:'p',action:'检索'}]},plugins:[{name:'p',version:'1.2.3',commit:null,repository:'https://github.com/author/plugin',sourceType:'npm',modelSelected:true,userSelected:false,installationStatus:'unknown'}]}};
test('shared collector schema accepts a bounded exact plugin snapshot',()=>{assert.equal(typeof POLICY_VERSION,'string');assert.deepEqual(validateTelemetryEvent(event),event);});
test('schema rejects extra raw payload and verified installation fiction',()=>{for(const value of [{...event,originalRequest:'private'},{...event,data:{...event.data,nextPrompt:'private'}},{...event,data:{plugins:[{...event.data.plugins[0],installationStatus:'installed'}]}},{...event,data:{plugins:[{...event.data.plugins[0],repository:'https://token:secret@example.com/p'}]}}])assert.throws(()=>validateTelemetryEvent(value));});
test('text cleaning removes local paths, filenames, emails, phone numbers, IPs, and credentials',()=>{
 const clean=sanitizeTelemetryText('整理 /Users/private/客户/report.md 与 C:\\secret\\work.pdf，邮箱 test@example.com，电话 +8613812345678，API_KEY=sk_live_secretvalue123，Bearer abcdsecret12345，IP 192.168.1.12，文件 payroll.csv',600);
 for(const secret of ['/Users/','客户','C:\\','secretvalue','abcdsecret','test@example.com','13812345678','192.168.1.12','payroll.csv','report.md'])assert.ok(!clean.includes(secret),secret);assert.equal(clean,'[敏感内容已省略]');
});
test('a suspected structured credential field is omitted rather than partially transmitted',()=>{assert.equal(sanitizeTelemetryText('password: do-not-share-this',500),'[敏感内容已省略]');});
test('JSON and quoted credential assignments are omitted as a whole',()=>{
 for(const raw of ['调试配置 {"api_key":"SYNTHETIC_CREDENTIAL_123","password":"SYNTHETIC_PASSWORD_456","cookie":"session=SYNTHETIC_COOKIE_789"}',"配置 'DEEPSEEK_API_KEY': 'SYNTHETIC_SECRET_123'",'配置 `access_token` = "SYNTHETIC_SECRET_123"'])assert.ok(!sanitizeTelemetryText(raw).includes('SYNTHETIC'));
});
test('quoted paths with spaces and arbitrary absolute paths do not leak directory names',()=>{
 const raw='读取 "/Users/synthetic/Library/Mobile Documents/Private Client/notes.md"，以及 /workspace/private-client/payroll.csv；C:\\Private Client\\notes.md';const clean=sanitizeTelemetryText(raw,500);
 for(const secret of ['Private Client','private-client','Mobile Documents','/workspace','/Users','C:\\'])assert.ok(!clean.includes(secret),secret);
});
test('fullwidth separators and explicit Chinese secret labels are omitted before projection',()=>{for(const raw of ['password：SYNTHETIC_FULLWIDTH_123','密码：SYNTHETIC_CN_123','访问令牌＝SYNTHETIC_CN_456','密钥: SYNTHETIC_CN_789'])assert.equal(sanitizeTelemetryText(raw),'[敏感内容已省略]');});
