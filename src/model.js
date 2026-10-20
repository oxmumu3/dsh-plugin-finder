import{FinderError,fail,record}from'./contracts.js';
function providerFailure(code){return new FinderError(['ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_QUOTA','ACCOUNT_TOKEN_INVALID'].includes(code)?code:'MODEL_REQUEST_FAILED');}
function interrupted(signal){return signal.reason instanceof FinderError?signal.reason:new FinderError('MODEL_ABORTED');}
function race(promise,signal){if(signal.aborted)return Promise.reject(interrupted(signal));return new Promise((resolve,reject)=>{const stop=()=>{signal.removeEventListener('abort',stop);reject(interrupted(signal));};signal.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',stop);signal.aborted?reject(interrupted(signal)):resolve(v);},e=>{signal.removeEventListener('abort',stop);reject(signal.aborted?interrupted(signal):e);});});}
export function createHostModel(ctx,{timeoutMs=90000}={}){
  let closed=false;const active=new Set();
  const selection=()=>{try{return ctx.get('agentDefaultModel',false)?.currentSelection();}catch{return null;}};
  const status=()=>{const s=selection();return{configured:Boolean(s?.provider&&s?.model),label:typeof s?.model==='string'?s.model:'未配置',reasoningPolicy:'lightweight-if-supported'};};
  return{status,
    async call({system,data,signal,maxTokens=5000}){
      if(closed)fail('CLOSED');const selected=selection();let llm;try{llm=ctx.get('llm',false);}catch{}
      if(!selected?.provider||!selected?.model||typeof llm?.prepareCall!=='function')fail('MODEL_UNAVAILABLE');
      const payload=JSON.stringify(data);if(payload.length>100000)fail('INVALID_INPUT');
      const own=new AbortController(),stop=()=>own.abort(new FinderError('MODEL_ABORTED'));active.add(own);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
      const timer=setTimeout(()=>own.abort(new FinderError('MODEL_TIMEOUT')),timeoutMs);let iterator,ended=false;
      try{
        const config={provider:selected.provider,model:selected.model,maxTokens};
        const lightweight=(controls,info)=>{const options=info.reasoning?.efforts;const chosen=options?.find(effort=>effort.id==='low')??options?.[0];return chosen?{...controls,reasoningEffort:chosen.id}:controls;};
        const prepared=await race(Promise.resolve().then(()=>llm.prepareCall(config,own.signal,lightweight)),own.signal);
        if(!record(prepared?.config)||typeof prepared?.stream!=='function')fail('MODEL_UNAVAILABLE');
        iterator=prepared.stream({...prepared.config,system,messages:[{role:'user',content:[{type:'text',text:payload}]}],tools:[],signal:own.signal})?.[Symbol.asyncIterator]?.();
        if(!iterator)fail('MODEL_INCOMPLETE');const blocks=new Map();let finish,total=0,usage;
        while(true){const next=await race(Promise.resolve().then(()=>iterator.next()),own.signal);if(next.done){ended=true;break;}const c=next.value;
          if(!record(c)||finish||!['block-start','text-delta','reasoning-delta','block-end','usage','finish'].includes(c.type))fail('MODEL_INCOMPLETE');
          if(c.type==='block-start'&&!['text','reasoning'].includes(c.blockType)||c.type==='block-end'&&!['text','reasoning'].includes(c.block?.type))fail('MODEL_INCOMPLETE');
          if(c.type==='text-delta'||c.type==='block-end'&&c.block?.type==='text'){
            if(!Number.isSafeInteger(c.index)||c.index<0||c.index>2000)fail('MODEL_INCOMPLETE');const part=c.type==='text-delta'?c.text:c.block.text;if(typeof part!=='string')fail('MODEL_INCOMPLETE');
            const prev=blocks.get(c.index)||'',nextText=c.type==='text-delta'?prev+part:part;total+=nextText.length-prev.length;if(total>40000)fail('MODEL_INCOMPLETE');blocks.set(c.index,nextText);
          }else if(c.type==='finish'){finish=c.reason?.kind;if(['max-tokens','length'].includes(finish))fail('MODEL_OUTPUT_LIMIT');if(finish==='aborted')fail('MODEL_ABORTED');if(finish==='error')throw providerFailure(c.reason?.failure?.code);if(finish!=='stop')fail('MODEL_INCOMPLETE');}
          else if(c.type==='usage'&&record(c.usage)){usage=Object.fromEntries(Object.entries(c.usage).filter(([k,v])=>['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens'].includes(k)&&Number.isSafeInteger(v)&&v>=0));}
        }
        const text=[...blocks].sort(([a],[b])=>a-b).map(([,v])=>v).join('');if(finish!=='stop'||!text.trim())fail('MODEL_INCOMPLETE');
        return{text,model:{label:selected.model,...(typeof prepared.config.reasoningEffort==='string'?{reasoningEffort:prepared.config.reasoningEffort}:{})},...(usage?{usage}:{})};
      }catch(error){if(own.signal.aborted)throw interrupted(own.signal);if(error instanceof FinderError)throw error;throw providerFailure(error?.code??error?.info?.code);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);active.delete(own);if(!ended&&iterator?.return)try{Promise.resolve(iterator.return()).catch(()=>{});}catch{}if(!own.signal.aborted)own.abort();}
    },
    close(){closed=true;for(const c of active)c.abort(new FinderError('MODEL_ABORTED'));active.clear();}
  };
}
