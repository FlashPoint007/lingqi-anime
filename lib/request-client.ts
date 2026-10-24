// Keep the catalogue usable on browsers without newer AbortSignal methods.
export function throwIfAborted(signal:AbortSignal){
 if(signal.aborted)throw signal.reason??new DOMException('请求已取消','AbortError');
}
export function timeoutSignal(ms:number):AbortSignal {
 if(typeof AbortSignal.timeout==='function')return AbortSignal.timeout(ms);
 const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('请求超时','TimeoutError')),Math.max(0,ms));return controller.signal;
}
export function anySignal(signals:AbortSignal[]):AbortSignal {
 if(typeof AbortSignal.any==='function')return AbortSignal.any(signals);
 const controller=new AbortController(),listeners=new Map<AbortSignal,()=>void>();
 const abort=(signal:AbortSignal)=>{if(controller.signal.aborted)return;controller.abort(signal.reason);for(const [source,listener] of listeners)source.removeEventListener('abort',listener);listeners.clear();};
 for(const signal of signals){if(signal.aborted){abort(signal);break;}const listener=()=>abort(signal);listeners.set(signal,listener);signal.addEventListener('abort',listener,{once:true});}
 return controller.signal;
}
export async function requestJson(url:string,options:RequestInit={}) {
 const signal=options.signal||timeoutSignal(30000);
 for(let attempt=0;;attempt++){
 let response:Response;
 try{response=await fetch(url,{...options,signal});}catch(error){
  if(signal.reason?.name==='TimeoutError'||(error as Error).name==='TimeoutError')throw new Error('请求超时，请重试');
  if(signal.aborted)throw error;
  throw new Error('网络连接失败，请检查网络后重试');
 }
 let data:any;try{data=await response.json();}catch(error){
  if(signal.reason?.name==='TimeoutError'||(error as Error).name==='TimeoutError')throw new Error('请求超时，请重试');
  if(signal.aborted)throw error;
  if([502,503,504].includes(response.status))throw new Error('站点网关暂时无法连接，请稍后重试（'+response.status+'）');
  throw new Error('本站接口未返回有效数据（'+response.status+'），请重试');
 }
 // Source operations are read-only. A cancelled browser scan can leave a
 // coalesced server lookup running briefly, so honor a short concurrency wait
 // without retrying quota exhaustion, mutations or unrelated failures.
 const retry=Number(response.headers.get('Retry-After'));
 if(url==='/api/source'&&response.status===429&&data?.error==='当前请求较多，请稍后重试'&&attempt<2&&retry>0&&retry<=3){
  await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},retry*1000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});continue;
 }
 if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'请求失败（'+response.status+'），请重试');
 if(!data||typeof data!=='object')throw new Error('本站接口返回的数据格式不正确，请重试');
 return data;
 }
}
