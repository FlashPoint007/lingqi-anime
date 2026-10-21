import {anySignal} from './request-client';
import {parseOfflinePlaylist} from './offline-hls';
import type {Subject} from './catalog';
// The same public module is used by the app, offline page and Service Worker.
const CHUNK_SIZE=2*1024*1024,storeModule='/offline-db.mjs';
let store:Promise<any>|undefined;
const offlineStore=()=>store??=import(/* @vite-ignore */ storeModule);
const readOffline=async(name:string,key:unknown)=>(await offlineStore()).readOffline(name,key);
const writeOffline=async(name:string,value:unknown)=>(await offlineStore()).writeOffline(name,value);
const listOffline=async()=>(await offlineStore()).listOffline();
const removeOffline=async(id:string)=>(await offlineStore()).removeOffline(id);
const offlineAssetURL=(id:string,asset:string)=>'/__offline_media/'+encodeURIComponent(id)+'/'+encodeURIComponent(asset);
export type OfflineDownload={id:string;owner:string;subject:Pick<Subject,'id'|'name'|'name_cn'>;episode:string;number?:number;sourceUrl:string;source?:string;ruleName?:string;createdAt:number;bytes:number;status:'downloading'|'complete'|'interrupted';type:'hls'|'video';entry:string;position:number;progressAt?:number;historyPending?:boolean;duration?:number;error?:string};
type Input={owner:string;subject:Subject;episode:string;number?:number;sourceUrl:string;source?:string;ruleName?:string;url:string;mediaType?:'hls'|'video'};
const LIMIT=1024*1024*1024,MAX_RECORDS=100;
let running:{id:string;controller:AbortController}|undefined;
let channel:BroadcastChannel|undefined;
function downloadChannel(){if(!channel&&typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('lingqi-offline');channel.onmessage=event=>{if(event.data?.type==='cancel'&&event.data.id===running?.id)running?.controller.abort();if(event.data?.type==='updated')window.dispatchEvent(new Event('lingqi-downloads'));};}return channel;}
const notify=()=>{window.dispatchEvent(new Event('lingqi-downloads'));channel?.postMessage({type:'updated'});};
export const activeDownload=()=>running?.id;
export async function downloads(owner:string){return (await listOffline() as OfflineDownload[]).filter(item=>item.owner===owner);}
export async function deleteDownload(id:string){const item=await readOffline('downloads',id);if(item?.status==='downloading'){
 if(running?.id===id)running.controller.abort();downloadChannel()?.postMessage({type:'cancel',id});
 if(!navigator.locks)throw Error('请在下载任务所在的页面取消下载');await navigator.locks.request('lingqi-offline-download',async()=>{await removeOffline(id);});
 }else await removeOffline(id);notify();}
export async function markOfflineProgressSaved(id:string,expectedTime:number,owner:string){await (await offlineStore()).updateOfflineProgress(id,owner,{ackTime:expectedTime});}
async function prepareOffline(){
 if(!window.isSecureContext||!('serviceWorker' in navigator)||!('indexedDB' in window))throw Error('此浏览器不支持本机离线存储，请使用新版 Chrome、Edge、Safari 或 Firefox');
 const reg=await navigator.serviceWorker.register('/offline-sw.js',{scope:'/',type:'module',updateViaCache:'none'});
 let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('离线页面准备超时，请重试')),20000);})]);}finally{clearTimeout(timer);}
 if(!reg.active)throw Error('离线服务尚未准备好，请重试');
 if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('离线服务尚未控制当前页面，请刷新后重试'));},5000);navigator.serviceWorker.addEventListener('controllerchange',done);if(navigator.serviceWorker.controller)done();});
}
export async function downloadEpisode(input:Input,onStatus?:(message:string)=>void){
 if(!navigator.locks)throw Error('此浏览器暂不支持离线下载，请升级浏览器后重试');
 return navigator.locks.request('lingqi-offline-download',{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw Error('另一个页面正在下载，请先完成或取消该任务');return performDownload(input,onStatus);});
}
async function performDownload(input:Input,onStatus?:(message:string)=>void){
 if(running)throw Error('已有下载任务，请等待完成或先取消');const controller=new AbortController(),id=crypto.randomUUID();running={id,controller};notify();
 downloadChannel();
 let item:OfflineDownload|undefined,lastNotice=0,totalBytes=0,nextRequest=0,budget=LIMIT;const abort=()=>controller.signal.throwIfAborted();
 const hide=()=>controller.abort(new DOMException('页面关闭，下载已中断','AbortError'));window.addEventListener('pagehide',hide);
 const request=async(url:string)=>{abort();const address=new URL(url,location.href);if(address.username||address.password||address.protocol!=='https:'&&address.origin!==location.origin)throw Error('视频下载地址不安全');
  const headerDeadline=new AbortController(),timer=setTimeout(()=>headerDeadline.abort(),30000);let response:Response;try{response=await fetch(address.href,{signal:anySignal([controller.signal,headerDeadline.signal]),credentials:'omit',redirect:'error',cache:'no-store'});}catch(error){if(controller.signal.aborted)throw error;throw Error('视频读取失败，可能不允许跨域下载或需要重新解析线路');}finally{clearTimeout(timer);}
  if(!response.ok||!response.body||response.type==='opaque'){void response.body?.cancel();throw Error('视频读取失败（'+response.status+'），请重新解析或更换线路');}return response;
 };
 const requestSegment=async(url:string)=>{
  abort();const delay=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(Date.now(),nextRequest)+100;
  if(delay)await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);reject(controller.signal.reason);};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},delay);controller.signal.addEventListener('abort',cancel,{once:true});if(controller.signal.aborted)cancel();});
  return request(url);
 };
 const tick=async(force=false)=>{abort();if(!item)return;if(force||Date.now()-lastNotice>700){lastNotice=Date.now();item={...item,bytes:totalBytes};await writeOffline('downloads',item);notify();if(item.type==='video')onStatus?.('正在下载视频 · '+(totalBytes/1048576).toFixed(1)+' MB');}};
 const saveResponse=async(assetId:string,response:Response,type?:string)=>{
  if(response.status===206){const range=response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/);if(!range||Number(range[1])+1!==Number(range[2])){void response.body?.cancel();throw Error('源站仅返回部分视频内容，无法完整下载');}}
  const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>budget-totalBytes){void response.body?.cancel();throw Error(budget<LIMIT?'本机剩余空间不足，请清理后重试':'单集超过 1 GB 下载上限，请选择较低清晰度线路');}
  const mime=type||response.headers.get('content-type')||'application/octet-stream';if(/html|json|javascript|xml|text\//i.test(mime)&&!type){void response.body?.cancel();throw Error('该线路没有返回视频文件');}
  const reader=response.body!.getReader();let buffer=new Uint8Array(CHUNK_SIZE),used=0,index=0,size=0;
  const flush=async()=>{abort();await writeOffline('chunks',{download:id,asset:assetId,index,bytes:buffer.buffer.slice(0,used)});index++;buffer=new Uint8Array(CHUNK_SIZE);used=0;};
  try{while(true){abort();let timer:ReturnType<typeof setTimeout>|undefined;let result:ReadableStreamReadResult<Uint8Array>;try{result=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('视频下载等待超过 30 秒，请更换线路后重试')),30000);})]);}finally{clearTimeout(timer);}if(result.done)break;
    const bytes=result.value;totalBytes+=bytes.byteLength;size+=bytes.byteLength;if(totalBytes>budget)throw Error(budget<LIMIT?'本机剩余空间不足，请清理后重试':'单集超过 1 GB 下载上限');
    for(let offset=0;offset<bytes.length;){const length=Math.min(CHUNK_SIZE-used,bytes.length-offset);buffer.set(bytes.subarray(offset,offset+length),used);used+=length;offset+=length;if(used===CHUNK_SIZE)await flush();}await tick();
   }if(used)await flush();if(!size)throw Error('源站返回了空视频');if(declared>0&&size!==declared)throw Error('视频内容未完整下载，请重试');abort();await writeOffline('assets',{download:id,id:assetId,size,type:mime,chunks:index});
  }finally{void reader.cancel().catch(()=>{});}
 };
 try{
  onStatus?.('正在准备本机离线页面…');await prepareOffline();abort();const existing=await downloads(input.owner);if(existing.length>=MAX_RECORDS)throw Error('本机下载已达 100 集，请删除部分下载后重试');
  if(existing.some(item=>item.status==='complete'&&item.subject.id===input.subject.id&&(input.number!==undefined?item.number===input.number:item.episode===input.episode)))throw Error('这一集已在本机下载列表中');
  const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.quota-(estimate.usage||0)<32*1024*1024)throw Error('本机可用存储不足 32 MB，请清理空间');
  if(estimate?.quota)budget=Math.min(LIMIT,Math.max(0,estimate.quota-(estimate.usage||0)-16*1024*1024));
  void navigator.storage?.persist?.().catch(()=>false);
  item={id,owner:input.owner,subject:{id:input.subject.id,name:input.subject.name.slice(0,200),name_cn:input.subject.name_cn?.slice(0,200)},episode:input.episode.slice(0,200),number:input.number,sourceUrl:input.sourceUrl,source:input.source,ruleName:input.ruleName,createdAt:Date.now(),bytes:0,status:'downloading',type:input.mediaType||'video',entry:'0',position:0};await writeOffline('downloads',item);notify();
  let response=await request(input.url),url=new URL(input.url,location.href).href;
  const hls=input.mediaType==='hls'||/mpegurl/i.test(response.headers.get('content-type')||'')||/\.m3u8(?:[?#]|$)/i.test(url);
  if(!hls)await saveResponse('0',response);
  else{
   const assets=new Map<string,string>();const local=(address:string)=>{if(!assets.has(address))assets.set(address,String(assets.size+1));return offlineAssetURL(id,assets.get(address)!);};let playlist;const seen=new Set<string>();
   for(let depth=0;depth<4;depth++){abort();if(seen.has(url))throw Error('HLS 清晰度列表出现循环');seen.add(url);const reader=response.body!.getReader();let text='',length=0;const decoder=new TextDecoder();try{while(true){let timer:ReturnType<typeof setTimeout>|undefined;let part:ReadableStreamReadResult<Uint8Array>;try{part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('HLS 列表读取超时，请重试')),30000);})]);}finally{clearTimeout(timer);}const {value,done}=part;if(done)break;length+=value.length;if(length>4*1024*1024)throw Error('HLS 播放列表过大');text+=decoder.decode(value,{stream:true});abort();}text+=decoder.decode();}finally{void reader.cancel().catch(()=>{});}playlist=parseOfflinePlaylist(text,url,local);if(!playlist.variant)break;url=playlist.variant;response=await request(url);}
   if(!playlist||playlist.variant)throw Error('HLS 清晰度嵌套过多');item={...item,type:'hls'};let cursor=0,finished=0;const refs=playlist.references;
   onStatus?.('正在下载 HLS 分片（0 / '+refs.length+'）…');const workers=Array.from({length:Math.min(3,refs.length)},async()=>{try{while(cursor<refs.length){abort();const address=refs[cursor++];await saveResponse(assets.get(address)!,await requestSegment(address));finished++;onStatus?.('正在下载 HLS 分片（'+finished+' / '+refs.length+'）…');}}catch(error){controller.abort();throw error;}});const results=await Promise.allSettled(workers);const failure=results.find((result):result is PromiseRejectedResult=>result.status==='rejected'&&result.reason?.name!=='AbortError')||results.find((result):result is PromiseRejectedResult=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
   const payload=new TextEncoder().encode(playlist.text);await saveResponse('0',new Response(payload),'application/vnd.apple.mpegurl');
  }
  abort();item={...item,bytes:totalBytes,status:'complete'};await writeOffline('downloads',item);notify();onStatus?.('下载完成，可从“离线下载”断网播放');return item;
 }catch(error){controller.abort();if(item){await removeOffline(id);if((error as Error).name!=='AbortError'){await writeOffline('downloads',{...item,status:'interrupted',bytes:0,error:(error as Error).name==='QuotaExceededError'?'本机空间不足，请清理存储后重新下载':(error as Error).message});}}notify();throw error;
 }finally{window.removeEventListener('pagehide',hide);if(running?.id===id)running=undefined;notify();}
}
