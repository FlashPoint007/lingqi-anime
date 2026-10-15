import {parseChapters,parseSearch,type Rule} from './web-core';
import type {Road} from './playback-client';
import {anySignal,timeoutSignal,requestJson} from './request-client';

export type SourceResult={name:string;url:string};
export type AvailabilityState='queued'|'checking'|'found'|'possible'|'not-found'|'error'|'playing'|'episode-error';
export type SourceAvailability={state:AvailabilityState;message:string;results:SourceResult[];source?:string;roads?:Road[];checkedAt?:number};
export const availabilityLabels:Record<AvailabilityState,string>={queued:'待检测',checking:'检测中',found:'有分集',possible:'待确认', 'not-found':'未匹配',error:'检测失败',playing:'已播放', 'episode-error':'本集失败'};
export function cachedAvailability(cache:Map<string,SourceAvailability>,key:string,now=Date.now()){
 const value=cache.get(key),age=now-(value?.checkedAt??0);const ttl=value?.state==='error'||value?.state==='episode-error'?60000:600000;
 return value?.checkedAt&&age>=0&&age<ttl?value:undefined;
}
export function storeAvailability(cache:Map<string,SourceAvailability>,key:string,value:SourceAvailability){
 cache.delete(key);cache.set(key,value);while(cache.size>160)cache.delete(cache.keys().next().value!);
}
export function invalidateAvailability(cache:Map<string,SourceAvailability>,scope:string){for(const key of cache.keys())if(key.startsWith(scope+'|'))cache.delete(key);}
export const normalizeTitle=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function matchesTitle(name:string,names:string[]){const n=normalizeTitle(name);return !!n&&names.some(value=>normalizeTitle(value)===n);}
const sourceErrorMessage=(error:unknown)=>(error as Error).name==='TimeoutError'?'源站响应超时，请稍后重新检测或更换视频源':(error as Error).message;
export async function sourceRequest(body:unknown,signal:AbortSignal){
 return requestJson('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
}
// Search and chapter checks deliberately do not resolve media or download video.
export async function checkSource(rule:Rule,names:string[],signal:AbortSignal,request=sourceRequest):Promise<SourceAvailability>{
 const terms=[...new Set(names.map(n=>n.trim()).filter(Boolean))].slice(0,2),results:SourceResult[]=[];
 const deadline=timeoutSignal(24000),combined=anySignal([signal,deadline]);
 const call=(body:unknown)=>request(body,anySignal([combined,timeoutSignal(10000)]));
 let lastError='',successfulSearch=false;const inspected=new Set<string>();
 for(const keyword of terms){
  if(signal.aborted)throw signal.reason;
  try{
   const url=rule.searchMode==='api'?rule.baseURL:rule.searchURL.replaceAll('@keyword',encodeURIComponent(keyword));
   const data=await call({rule,url,search:true,operation:'search',keyword});successfulSearch=true;
   const batch:SourceResult[]=data.results||parseSearch(data.html,rule,data.url||url);
   for(const result of batch.slice(0,40))if(!results.some(r=>r.url===result.url))results.push(result);
   for(const match of results.filter(r=>matchesTitle(r.name,terms)).slice(0,3)){
    if(inspected.has(match.url))continue;inspected.add(match.url);
    try{const detail=await call({rule,url:match.url,operation:'chapters',source:match.url});const roads:Road[]=detail.roads||parseChapters(detail.html,rule,detail.url||match.url);
     if(roads.some(r=>r.episodes.length))return {state:'found',message:roads.length+' 条线路 · 最多 '+Math.max(...roads.map(r=>r.episodes.length))+' 集',results,source:match.url,roads,checkedAt:Date.now()};
     lastError='同名条目未解析到分集';
    }catch(e){lastError=sourceErrorMessage(e);}
   }
  }catch(e){lastError=sourceErrorMessage(e);}
 }
 if(signal.aborted)throw signal.reason;
 const state=lastError?'error':results.length?'possible':successfulSearch?'not-found':'error';
 return {state,message:lastError||(results.length?'有相关条目，请确认是否为当前番剧':'中文名和原名均未找到匹配；可手动尝试别名'),results,checkedAt:Date.now()};
}
export async function checkSources<T>(items:T[],signal:AbortSignal,check:(item:T)=>Promise<void>,concurrency=3){
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),items.length)},async()=>{while(!signal.aborted){const item=items[cursor++];if(item===undefined)return;await check(item);}}));
}
