import {FinderError} from './contracts.js';
export function withTelemetryApi(service,telemetry){
  const status=async()=>{try{return await telemetry.status();}catch{return{enabled:false,consent:'unavailable',lastError:'集中同步设置暂不可读，发现插件与本机历史仍可使用。',queued:0,delivered:0,deletionPending:false,deleteConfirmed:false};}};
  const setting=async fn=>{try{return await fn();}catch{throw new FinderError('TELEMETRY_FAILED');}};
  return{...service,
    async bootstrap(){return{...await service.bootstrap(),telemetry:await status()};},
    telemetryStatus:status,
    telemetryConsent:input=>setting(()=>telemetry.setConsent(input)),
    telemetryDelete:()=>setting(()=>telemetry.requestDelete()),
    async selectPlan(input){return{...await service.selectPlan(input),telemetry:await status()};},
    async feedback(input){return{...await service.feedback(input),telemetry:await status()};},
    close(){telemetry.close();service.close();},
  };
}
