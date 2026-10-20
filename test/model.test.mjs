import test from 'node:test';
import assert from 'node:assert/strict';
const {createHostModel}=await import('../src/model.js').catch(()=>({}));
function context(stream){return{get(name){if(name==='agentDefaultModel')return{currentSelection:()=>({provider:'configured',model:'real-model'})};if(name==='llm')return{prepareCall:async config=>({config,stream})};}};}
async function* complete(){yield{type:'text-delta',index:0,text:'{"goal":"测试"}'};yield{type:'finish',reason:{kind:'stop'}};}
test('native model adapter uses explicit global selection and no tools',async()=>{
  assert.equal(typeof createHostModel,'function');let payload;
  const model=createHostModel(context(function(arg){payload=arg;return complete();}));
  const result=await model.call({system:'只返回JSON',data:{task:'test'},maxTokens:200});
  assert.equal(result.text,'{"goal":"测试"}');assert.equal(result.model.label,'real-model');assert.deepEqual(payload.tools,[]);
  assert.equal(payload.provider,'configured');model.close();
});
test('missing model is actionable and does not make a provider request',async()=>{
  const model=createHostModel({get(){return null;}});assert.equal(model.status().configured,false);
  await assert.rejects(model.call({system:'x',data:{}}),e=>e.code==='MODEL_UNAVAILABLE');model.close();
});
test('incomplete and tool output are rejected rather than treated as recommendations',async()=>{
  const model=createHostModel(context(async function*(){yield{type:'text-delta',index:0,text:'{}'};}));
  await assert.rejects(model.call({system:'x',data:{}}),e=>e.code==='MODEL_INCOMPLETE');model.close();
  const unsafe=createHostModel(context(async function*(){yield{type:'tool-call-delta',index:0,text:'{}'};}));
  await assert.rejects(unsafe.call({system:'x',data:{}}),e=>e.code==='MODEL_INCOMPLETE');unsafe.close();
});
test('deadline rejects an unresponsive adapter and close prevents further work',async()=>{
  const model=createHostModel(context(()=>({[Symbol.asyncIterator](){return{next:()=>new Promise(()=>{}),return:async()=>({done:true})};}})),{timeoutMs:20});
  await assert.rejects(model.call({system:'x',data:{}}),e=>e.code==='MODEL_TIMEOUT');model.close();
  await assert.rejects(model.call({system:'x',data:{}}),e=>e.code==='CLOSED');
});
test('output token exhaustion reports a bounded length error, not a generic broken stream',async()=>{
  const ctx={get(name){if(name==='agentDefaultModel')return{currentSelection:()=>({provider:'test',model:'test'})};if(name==='llm')return{prepareCall:async()=>({config:{},async *stream(){yield{type:'finish',reason:{kind:'max-tokens'}};}})};}};
  const model=createHostModel(ctx);await assert.rejects(model.call({system:'test',data:{},maxTokens:8000}),e=>e.code==='MODEL_OUTPUT_LIMIT');model.close();
});
test('native terminal account failures retain safe actionable recovery codes',async()=>{
  for(const code of ['ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_QUOTA','ACCOUNT_TOKEN_INVALID']){
    const model=createHostModel(context(async function*(){yield{type:'finish',reason:{kind:'error',failure:{code,message:'secret-token /Users/private/account'}}};}));
    try{await assert.rejects(model.call({system:'test',data:{}}),error=>{
      assert.equal(error.code,code);assert.doesNotMatch(error.message,/secret-token|\/Users\/private/);
      if(code==='ACCOUNT_TOKEN_INVALID')assert.match(error.message,/重新连接|重新登录/);
      return true;
    });}finally{model.close();}
  }
});
test('unknown terminal provider failures use a fixed safe request failure',async()=>{
  for(const failure of [{code:'UNKNOWN_PROVIDER_CODE',message:'secret-token /Users/private/account'},{message:'secret-token'},undefined]){
    const model=createHostModel(context(async function*(){yield{type:'finish',reason:{kind:'error',failure}};}));
    try{await assert.rejects(model.call({system:'test',data:{}}),error=>{
      assert.equal(error.code,'MODEL_REQUEST_FAILED');assert.doesNotMatch(error.message,/secret-token|UNKNOWN_PROVIDER_CODE|\/Users\/private/);return true;
    });}finally{model.close();}
  }
});
test('native aborted finish is cancellation even without a caller abort',async()=>{
  const model=createHostModel(context(async function*(){yield{type:'finish',reason:{kind:'aborted',failure:{code:'ABORTED',message:'secret-token /Users/private/account'}}};}));
  try{await assert.rejects(model.call({system:'test',data:{}}),error=>{
    assert.equal(error.code,'MODEL_ABORTED');assert.doesNotMatch(error.message,/secret-token|\/Users\/private/);return true;
  });}finally{model.close();}
});
test('thrown account-token failures share the terminal-chunk recovery mapping',async()=>{
  const model=createHostModel(context(async function*(){throw Object.assign(new Error('secret-token /Users/private/account'),{code:'ACCOUNT_TOKEN_INVALID'});}));
  try{await assert.rejects(model.call({system:'test',data:{}}),error=>{
    assert.equal(error.code,'ACCOUNT_TOKEN_INVALID');assert.match(error.message,/重新连接|重新登录/);assert.doesNotMatch(error.message,/secret-token|\/Users\/private/);return true;
  });}finally{model.close();}
});
function exactRouteContext(info){
  const selected=Object.freeze({provider:'configured',model:'real-model',reasoningEffort:'max'});
  let initial,prepared;
  return{selected,get initial(){return initial;},get prepared(){return prepared;},ctx:{get(name){
    if(name==='agentDefaultModel')return{currentSelection:()=>selected};
    if(name==='llm')return{prepareCall:async(config,signal,configure)=>{
      initial={...config};const {provider,model,...controls}=config;
      const chosen=typeof configure==='function'?configure(Object.freeze(controls),info):controls;
      prepared=Object.freeze({provider,model,...chosen});return{config:prepared,stream:complete};
    }};
  }}};
}
test('lightweight policy selects the declared low effort without changing the global selection',async()=>{
  const h=exactRouteContext({reasoning:{efforts:[{id:'off',name:'Off'},{id:'low',name:'Low'},{id:'max',name:'Max'}]}});
  const model=createHostModel(h.ctx);
  try{const result=await model.call({system:'test',data:{},maxTokens:8000});
    assert.equal(model.status().reasoningPolicy,'lightweight-if-supported');
    assert.equal(h.initial.reasoningEffort,undefined);assert.equal(h.prepared.reasoningEffort,'low');
    assert.equal(h.prepared.provider,h.selected.provider);assert.equal(h.prepared.model,h.selected.model);
    assert.equal(result.model.reasoningEffort,'low');assert.equal(h.selected.reasoningEffort,'max');
  }finally{model.close();}
});
test('lightweight policy falls back to the first exact-route effort without guessing an id',async()=>{
  const h=exactRouteContext({reasoning:{efforts:[{id:'provider-light',name:'Light'},{id:'provider-deep',name:'Deep'}]}});
  const model=createHostModel(h.ctx);
  try{const result=await model.call({system:'test',data:{}});
    assert.equal(h.prepared.reasoningEffort,'provider-light');assert.equal(result.model.reasoningEffort,'provider-light');assert.equal(h.selected.reasoningEffort,'max');
  }finally{model.close();}
});
test('a route without reasoning metadata does not inherit an unsupported global effort',async()=>{
  const h=exactRouteContext({});const model=createHostModel(h.ctx);
  try{const result=await model.call({system:'test',data:{}});
    assert.equal(h.prepared.reasoningEffort,undefined);assert.equal(result.model.reasoningEffort,undefined);assert.equal(h.selected.reasoningEffort,'max');
  }finally{model.close();}
});
