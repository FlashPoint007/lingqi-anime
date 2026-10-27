import {throwIfAborted,anySignal,requestJson,timeoutSignal} from './request-client';
import {parseOfflinePlaylist} from './offline-hls';
import {offlineIdentity,responseValidator,validResume} from './offline-resume';
import type {Subject} from './catalog';
import type {Rule} from './web-core';
import {captureOfflineDanmaku,type OfflineDanmaku} from './offline-danmaku';
const CHUNK_SIZE=2*1024*1024,storeModule='/offline-transfer-v4.mjs';
let store:Promise<any>|undefined;
const offlineStore=()=>store??=import(/* @vite-ignore */ storeModule);
const readOffline=async(name:string,key:unknown)=>(await offlineStore()).readOffline(name,key);
const writeOffline=async(name:string,value:unknown)=>(await offlineStore()).writeOffline(name,value);
const listOffline=async()=>(await offlineStore()).listOffline();
const removeOffline=async(id:string)=>(await offlineStore()).removeOffline(id);
const assetsFor=async(id:string):Promise<Asset[]>=>(await offlineStore()).listOfflineAssets(id);
const removeAsset=async(id:string,asset:string)=>(await offlineStore()).removeOfflineAsset(id,asset);
const localURL=(id:string,asset:string)=>'/__offline_media/'+encodeURIComponent(id)+'/'+asset;
export type OfflineDownload={danmaku?:OfflineDanmaku;id:string;owner:string;subject:Pick<Subject,'id'|'name'|'name_cn'>;episode:string;number?:number;sourceUrl:string;source?:string;ruleName?:string;createdAt:number;bytes:number;status:'queued'|'paused'|'downloading'|'complete'|'interrupted';type:'hls'|'video';entry:string;position:number;progressAt?:number;historyPending?:boolean;duration?:number;error?:string;totalBytes?:number;segmentsDone?:number;segmentsTotal?:number;speed?:number;updatedAt?:number;fingerprint?:string;downloadUrl?:string;identity?:string};
type Asset={download:string;id:string;size:number;type:string;chunks:number;complete?:boolean;validator?:string;total?:number};
type Input={owner:string;subject:Pick<Subject,'id'|'name'|'name_cn'>;episode:string;number?:number;sourceUrl:string;source?:string;ruleName?:string;url:string;mediaType?:'hls'|'video';rule?:Rule};
const LIMIT=1024*1024*1024,MAX_RECORDS=100;
let running:{id:string;owner:string;controller:AbortController}|undefined,channel:BroadcastChannel|undefined;
function downloadChannel(){if(!channel&&typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('lingqi-offline');channel.onmessage=event=>{if(event.data?.type==='pause'&&event.data.id===running?.id&&event.data.owner===running?.owner)running?.controller.abort(new DOMException('下载已暂停','AbortError'));if(event.data?.type==='updated')window.dispatchEvent(new Event('lingqi-downloads'));};}return channel;}
const notify=()=>{window.dispatchEvent(new Event('lingqi-downloads'));channel?.postMessage({type:'updated'});};
export const activeDownload=()=>running?.id;
export function pauseOwnerDownloads(owner:string){if(running?.owner===owner)running.controller.abort(new DOMException('个人空间已切换，下载已暂停','AbortError'));}
export async function downloads(owner:string){return (await listOffline() as OfflineDownload[]).filter(item=>item.owner===owner);}
async function owned(id:string,owner:string){const item=await readOffline('downloads',id) as OfflineDownload|undefined;if(!item||item.owner!==owner)throw Error('当前个人空间中没有这个下载');return item;}
export async function saveOfflineDanmaku(id:string,owner:string,signal:AbortSignal=new AbortController().signal){
 const item=await owned(id,owner);if(item.status!=='complete')throw Error('请等待视频下载完成后补存弹幕');
 const data=await captureOfflineDanmaku(item,signal);throwIfAborted(signal);
 const updated=await (await offlineStore()).updateOfflineDanmaku(id,owner,data) as OfflineDownload|undefined;
 if(!updated)throw Error('下载已删除或个人空间已变化，未写入弹幕');notify();return updated;
}
export async function pauseDownload(id:string,owner:string){await owned(id,owner);if(running?.id===id)running.controller.abort(new DOMException('下载已暂停','AbortError'));downloadChannel()?.postMessage({type:'pause',id,owner});await navigator.locks.request('lingqi-offline-download',async()=>{const item=await owned(id,owner);if(item.status!=='complete')await writeOffline('downloads',{...item,status:'paused',speed:0});});notify();}
export async function deleteDownload(id:string,owner:string){await pauseDownload(id,owner);await navigator.locks.request('lingqi-offline-download',async()=>{await owned(id,owner);await removeOffline(id);});notify();}
export async function markOfflineProgressSaved(id:string,expectedTime:number,owner:string){await (await offlineStore()).updateOfflineProgress(id,owner,{ackTime:expectedTime});}
async function prepareOffline(){
 if(!window.isSecureContext||!('serviceWorker' in navigator)||!('indexedDB' in window))throw Error('此浏览器不支持本机离线存储，请使用新版浏览器');
 const reg=await navigator.serviceWorker.register('/offline-sw.js',{scope:'/',type:'module',updateViaCache:'none'});
 let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('离线页面准备超时，请重试')),20000);})]);}finally{clearTimeout(timer);}
 if(!reg.active)throw Error('离线服务尚未准备好，请重试');
 if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('离线服务尚未控制当前页面，请刷新后重试'));},5000);navigator.serviceWorker.addEventListener('controllerchange',done);if(navigator.serviceWorker.controller)done();});
}
async function locked(input:Input,old?:OfflineDownload,onStatus?:(message:string)=>void,queuedOnly=false){
 if(!navigator.locks)throw Error('此浏览器暂不支持安全离线下载，请升级浏览器后重试');
 return navigator.locks.request('lingqi-offline-download',{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw Error('另一个页面正在下载，可稍后继续');if(old){old=await owned(old.id,input.owner);if(old.status==='complete'||queuedOnly&&old.status!=='queued')return old;}return performDownload(input,old,onStatus);});
}
export function downloadEpisode(input:Input,onStatus?:(message:string)=>void){return locked(input,undefined,onStatus);}
export async function resumeDownload(id:string,owner:string,rules:Rule[],restart=false,queuedOnly=false){
 let item=await owned(id,owner);if(item.status==='complete')return item;
 const rule=item.ruleName?rules.find(rule=>rule.name===item.ruleName&&rule.enabled!==false):undefined;
 if(restart){await pauseDownload(id,owner);await navigator.locks.request('lingqi-offline-download',async()=>{item=await owned(id,owner);for(const asset of await assetsFor(id))await removeAsset(id,asset.id);item={...item,bytes:0,fingerprint:undefined,identity:undefined,totalBytes:undefined,segmentsDone:0};await writeOffline('downloads',item);});}
 return locked({...item,url:item.ruleName?'':item.downloadUrl||item.sourceUrl,mediaType:item.type,rule},item,undefined,queuedOnly);
}
export async function queueOfflineEpisodes(inputs:Input[]){
 if(!inputs.length||inputs.length>50)throw Error('每批请选择 1 至 50 集');if(!navigator.locks)throw Error('此浏览器暂不支持安全离线下载，请升级浏览器后重试');await prepareOffline();let count=0;
 // Serialize queue mutations across tabs as well as download writers.
 await navigator.locks.request('lingqi-offline-queue',async()=>{const owner=inputs[0].owner,existing=await downloads(owner),keys=new Set(existing.map(x=>x.subject.id+':'+x.sourceUrl)),fresh:Input[]=[];for(const input of inputs){if(input.owner!==owner)throw Error('批量任务的个人空间不一致');const key=input.subject.id+':'+input.sourceUrl;if(keys.has(key))continue;keys.add(key);fresh.push(input);}if(existing.length+fresh.length>MAX_RECORDS)throw Error('离线库最多保留 100 个任务，请先移除旧任务或减少本批集数');for(const input of fresh){await writeOffline('downloads',record(input,'queued'));count++;}});notify();return count;
}
function record(input:Input,status:OfflineDownload['status']):OfflineDownload{return {id:crypto.randomUUID(),owner:input.owner,subject:{id:input.subject.id,name:input.subject.name.slice(0,200),name_cn:input.subject.name_cn?.slice(0,200)},episode:input.episode.slice(0,200),number:input.number,sourceUrl:input.sourceUrl,source:input.source,ruleName:input.ruleName,createdAt:Date.now(),bytes:0,status,type:input.mediaType||'video',entry:'0',position:0,downloadUrl:input.url};}
async function performDownload(input:Input,old?:OfflineDownload,onStatus?:(message:string)=>void){
 if(running)throw Error('已有下载任务，请等待完成或先暂停');const controller=new AbortController(),id=old?.id||crypto.randomUUID();running={id,owner:input.owner,controller};downloadChannel();notify();
 let item:OfflineDownload|undefined,lastNotice=0,received=0,totalBytes=0,nextRequest=0,budget=LIMIT,startTime=Date.now();const abort=()=>throwIfAborted(controller.signal);
 const hide=()=>controller.abort(new DOMException('页面关闭，已完成的分片会保留','AbortError'));window.addEventListener('pagehide',hide);
 const request=async(url:string,headers?:HeadersInit)=>{abort();const address=new URL(url,location.href);if(address.username||address.password||address.protocol!=='https:'&&address.origin!==location.origin)throw Error('视频下载地址不安全');
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),30000);let response:Response;try{response=await fetch(address.href,{headers,signal:anySignal([controller.signal,deadline.signal]),credentials:'omit',redirect:'error',cache:'no-store'});}catch(error){if(controller.signal.aborted)throw error;throw Error('视频读取失败，可能不允许跨域下载或需要重新解析线路');}finally{clearTimeout(timer);}
  if(!response.ok||!response.body||response.type==='opaque'){void response.body?.cancel();throw Error('视频读取失败（'+response.status+'），可继续重试或更换线路');}return response;
 };
 const tick=async(force=false)=>{abort();if(!item)return;if(force||Date.now()-lastNotice>600){lastNotice=Date.now();item={...item,bytes:totalBytes,speed:Math.round(received/Math.max(1,(Date.now()-startTime)/1000)),updatedAt:Date.now()};await writeOffline('downloads',item);notify();onStatus?.(item.type==='hls'?'已保存分片 '+(item.segmentsDone||0)+' / '+(item.segmentsTotal||0)+' · '+(totalBytes/1048576).toFixed(1)+' MB':'已接收 '+(totalBytes/1048576).toFixed(1)+' MB'+(item.totalBytes?' / '+(item.totalBytes/1048576).toFixed(1)+' MB':''));}};
 const read=async(reader:ReadableStreamDefaultReader<Uint8Array>)=>{abort();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('视频读取超过 30 秒，已完成的分片已保留')),30000);})]);}finally{clearTimeout(timer);}};
 const saveResponse=async(assetId:string,response:Response,type?:string,partial?:Asset)=>{
  const offset=partial?.size||0,declared=Number(response.headers.get('content-length'))||0;
  if(response.status===206&&!offset){const range=response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/);if(!range||Number(range[1])+1!==Number(range[2])){void response.body?.cancel();throw Error('源站仅返回部分视频内容，无法完整下载');}}
  if(declared>budget-totalBytes){void response.body?.cancel();throw Error('视频超过本机可用空间或单集 1 GB 上限');}
  const mime=type||response.headers.get('content-type')||'application/octet-stream';if(/html|json|javascript|xml|text\//i.test(mime)&&!type){void response.body?.cancel();throw Error('该线路没有返回视频文件');}
  const validator=responseValidator(response.headers),asset:Asset={download:id,id:assetId,size:offset,type:mime,chunks:partial?.chunks||0,complete:false,validator,total:offset+declared||undefined};
  const reader=response.body!.getReader();let buffer=new Uint8Array(CHUNK_SIZE),used=0,size=offset;
  const flush=async()=>{abort();asset.size+=used;await (await offlineStore()).checkpointOffline({download:id,asset:assetId,index:asset.chunks,bytes:buffer.buffer.slice(0,used)},{...asset,chunks:asset.chunks+1});asset.chunks++;buffer=new Uint8Array(CHUNK_SIZE);used=0;};
  try{while(true){const result=await read(reader);if(result.done)break;const bytes=result.value;received+=bytes.length;totalBytes+=bytes.length;size+=bytes.length;if(totalBytes>budget)throw Error('视频超过本机可用空间或单集 1 GB 上限');for(let at=0;at<bytes.length;){const length=Math.min(CHUNK_SIZE-used,bytes.length-at);buffer.set(bytes.subarray(at,at+length),used);used+=length;at+=length;if(used===CHUNK_SIZE)await flush();}await tick();}
   if(size===offset)throw Error('源站返回了空视频');if(declared&&size-offset!==declared)throw Error('视频内容未完整下载，请继续重试');if(used)await flush();abort();await writeOffline('assets',{...asset,complete:true});
  }finally{void reader.cancel().catch(()=>{});}
 };
 try{
  onStatus?.('正在准备本机离线页面…');await prepareOffline();abort();const existing=await downloads(input.owner);if(!old&&existing.length>=MAX_RECORDS)throw Error('本机下载已达 100 集，请删除部分下载后重试');
  if(!old&&existing.some(x=>x.subject.id===input.subject.id&&(input.number!==undefined?x.number===input.number:x.episode===input.episode)))throw Error('这一集已在本机下载列表中，请到离线下载继续或删除旧任务');
  item=old?{...old,status:'downloading',error:undefined,speed:0}:{...record(input,'downloading'),id};await writeOffline('downloads',item);notify();
  if(input.ruleName&&!input.rule&&!input.url)throw Error('当前视频源已停用，请先启用原视频源，或删除任务并换源下载');
  if(input.rule){const resolved=await requestJson('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'resolve',rule:input.rule,url:item.sourceUrl,source:item.source}),signal:anySignal([controller.signal,timeoutSignal(45000)])});if(resolved.mode!=='video'||typeof resolved.url!=='string')throw Error(resolved.message||'当前剧集未解析到视频');input={...input,url:resolved.url,mediaType:resolved.mediaType};}
  const stored=await assetsFor(id);totalBytes=stored.reduce((n,a)=>n+a.size,0);const estimate=await navigator.storage?.estimate?.();if(estimate?.quota){budget=Math.min(LIMIT,totalBytes+Math.max(0,estimate.quota-(estimate.usage||0)-16*1024*1024));if(budget-totalBytes<2*CHUNK_SIZE)throw Error('本机存储空间不足，请清理后继续');}void navigator.storage?.persist?.().catch(()=>false);
  const identity=offlineIdentity(input.url,location.origin);let partial=stored.find(a=>a.id==='0'&&!a.complete),response:Response;
  if(old?.identity===identity&&old.type==='video'&&partial?.validator&&partial.total&&partial.size%CHUNK_SIZE===0&&partial.size>0&&partial.size<partial.total){response=await request(input.url,{Range:'bytes='+partial.size+'-','If-Range':partial.validator});if(!validResume(response,partial.size,partial.validator,partial.total)){await response.body?.cancel();await removeAsset(id,'0');totalBytes-=partial.size;partial=undefined;response=await request(input.url);}}
  else{response=await request(input.url);if(partial){await removeAsset(id,'0');totalBytes-=partial.size;partial=undefined;}}
  item={...item,identity,downloadUrl:input.url};let url=new URL(input.url,location.href).href;
  const hls=input.mediaType==='hls'||/mpegurl/i.test(response.headers.get('content-type')||'')||/\.m3u8(?:[?#]|$)/i.test(url);
  if(!hls){if(old?.fingerprint){for(const asset of await assetsFor(id))await removeAsset(id,asset.id);totalBytes=0;}item={...item,type:'video',totalBytes:partial?.total||Number(response.headers.get('content-length'))||undefined,segmentsTotal:undefined,segmentsDone:undefined};await tick(true);await saveResponse('0',response,undefined,partial);}
  else{
   const assets=new Map<string,string>(),local=(address:string)=>{if(!assets.has(address))assets.set(address,String(assets.size+1));return localURL(id,assets.get(address)!);};let playlist;const seen=new Set<string>();
   for(let depth=0;depth<4;depth++){abort();if(seen.has(url))throw Error('HLS 清晰度列表出现循环');seen.add(url);const reader=response.body!.getReader();let text='',length=0;const decoder=new TextDecoder();try{while(true){const part=await read(reader);if(part.done)break;length+=part.value.length;if(length>4*1024*1024)throw Error('HLS 播放列表过大');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{void reader.cancel().catch(()=>{});}playlist=parseOfflinePlaylist(text,url,local);if(!playlist.variant)break;url=playlist.variant;response=await request(url);}
   if(!playlist||playlist.variant)throw Error('HLS 清晰度嵌套过多');
   const signature=JSON.stringify([playlist.text,playlist.references.map(address=>offlineIdentity(address,location.origin))]);const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(n=>n.toString(16).padStart(2,'0')).join('');
   if(old?.fingerprint&&old.fingerprint!==fingerprint)throw Error('源站播放列表已变化，不能拼接旧分片。请点击“重新下载”从头保存');
   if(!old?.fingerprint){for(const asset of await assetsFor(id))await removeAsset(id,asset.id);totalBytes=0;}
   const complete=new Set((await assetsFor(id)).filter(a=>a.complete&&a.id!=='0').map(a=>a.id));let cursor=0;item={...item,type:'hls',fingerprint,totalBytes:undefined,segmentsDone:complete.size,segmentsTotal:playlist.references.length};await tick(true);
   const refs=playlist.references,workers=Array.from({length:Math.min(3,refs.length)},async()=>{try{while(cursor<refs.length){abort();const address=refs[cursor++],asset=assets.get(address)!;if(complete.has(asset))continue;const previous=await readOffline('assets',[id,asset]);if(previous){await removeAsset(id,asset);totalBytes-=previous.size;}const delay=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(Date.now(),nextRequest)+100;if(delay)await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(controller.signal.reason);};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},delay);controller.signal.addEventListener('abort',cancel,{once:true});if(controller.signal.aborted)cancel();});await saveResponse(asset,await request(address));item!.segmentsDone=(item!.segmentsDone||0)+1;await tick(true);}}catch(error){controller.abort();throw error;}});
   const results=await Promise.allSettled(workers),failure=results.find((r):r is PromiseRejectedResult=>r.status==='rejected'&&r.reason?.name!=='AbortError')||results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failure)throw failure.reason;
   const payload=new TextEncoder().encode(playlist.text);await saveResponse('0',new Response(payload),'application/vnd.apple.mpegurl');
  }
  abort();item={...item,bytes:totalBytes,status:'complete',speed:0};await writeOffline('downloads',item);notify();onStatus?.('视频已下载，正在保存对应集数的弹幕…');
  // Optional comment retrieval cannot turn a completed video into an interrupted download.
  try{item=await saveOfflineDanmaku(id,input.owner,controller.signal);onStatus?.(item.danmaku?.status==='saved'?'视频与 '+item.danmaku.comments.length+' 条弹幕已保存，可断网播放':'视频已下载；'+(item.danmaku?.notes[0]||'这一集暂无可保存的弹幕'));}catch{onStatus?.('视频已下载；弹幕暂未保存，可在离线列表补存或导入');}
  return item;
 }catch(error){controller.abort();if(item){const saved=await assetsFor(id);for(const asset of saved)if(item.type==='hls'&&!asset.complete||item.type==='video'&&!asset.complete&&(asset.size%CHUNK_SIZE!==0||!asset.validator||!asset.total))await removeAsset(id,asset.id);const retained=await assetsFor(id);await writeOffline('downloads',{...item,status:(error as Error).name==='AbortError'?'paused':'interrupted',bytes:retained.reduce((n,a)=>n+a.size,0),segmentsDone:retained.filter(a=>a.id!=='0'&&a.complete).length,speed:0,error:(error as Error).name==='AbortError'?undefined:(error as Error).name==='QuotaExceededError'?'本机空间不足，请清理后继续':(error as Error).message});}notify();throw error;
 }finally{window.removeEventListener('pagehide',hide);if(running?.id===id)running=undefined;notify();}
}
