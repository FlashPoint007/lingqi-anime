import {prepareLocalDownload,handToBrowser,type BrowserDownload} from './browser-download-client';
import {throwIfAborted,requestJson,anySignal,timeoutSignal} from './request-client';
import {validateRule,publicUrl,type Rule} from './web-core';
import type {Subject} from './catalog';
import type {Episode} from './playback-client';
export type DownloadTask={id:string;subject:Pick<Subject,'id'|'name'|'name_cn'>;episode:Episode;source?:string;rule?:Rule;directUrl?:string;mediaType?:'hls'|'video';state:'queued'|'preparing'|'ready'|'handed'|'failed'|'cancelled';createdAt:number;updatedAt:number;download?:BrowserDownload;preparedAt?:number;error?:string};
export type DownloadQueue={paused:boolean;tasks:DownloadTask[]};
const prefix='kw-download-queue:',eventName='lingqi-download-queue',active=new Map<string,{id?:string;controller:AbortController}>();
const key=(owner:string)=>prefix+owner;
export function readDownloadQueue(owner:string):DownloadQueue{
 try{const raw=localStorage.getItem(key(owner));if(!raw||raw.length>2*1024*1024)return {paused:false,tasks:[]};const value=JSON.parse(raw);return {paused:value.paused===true,tasks:Array.isArray(value.tasks)?value.tasks.filter((t:DownloadTask)=>t&&/^[-\w]{16,80}$/.test(t.id)&&t.subject&&Number.isSafeInteger(t.subject.id)&&typeof t.subject.name==='string'&&t.episode&&typeof t.episode.url==='string'&&typeof t.episode.name==='string'&&['queued','preparing','ready','handed','failed','cancelled'].includes(t.state)).slice(-100):[]};}catch{return {paused:false,tasks:[]};}
}
function write(owner:string,value:DownloadQueue){const raw=JSON.stringify(value);if(raw.length>2*1024*1024)throw Error('下载任务记录过大，请先移除旧记录');localStorage.setItem(key(owner),raw);window.dispatchEvent(new Event(eventName));}
function edit(owner:string,id:string,change:Partial<DownloadTask>){const book=readDownloadQueue(owner),task=book.tasks.find(task=>task.id===id);if(!task)return;Object.assign(task,change,{updatedAt:Date.now()});write(owner,book);}
export function enqueueDownloads(owner:string,subject:Subject,episodes:Episode[],rule:Rule,source?:string){
 if(!episodes.length||episodes.length>50)throw Error('每批请选择 1 至 50 集');const validRule=validateRule(rule),book=readDownloadQueue(owner);let added=0;
 for(const episode of episodes){publicUrl(episode.url);if(book.tasks.some(task=>task.subject.id===subject.id&&task.episode.url===episode.url&&task.rule?.name===rule.name&&!['cancelled','failed'].includes(task.state)))continue;if(book.tasks.length>=100)throw Error('下载队列最多保留 100 项，请先移除旧任务');book.tasks.push({id:crypto.randomUUID(),subject:{id:subject.id,name:subject.name.slice(0,200),name_cn:subject.name_cn?.slice(0,200)},episode:{name:episode.name.slice(0,200),url:episode.url,number:episode.number},source,rule:validRule,state:'queued',createdAt:Date.now(),updatedAt:Date.now()});added++;}
 write(owner,book);return added;
}
export function recordHandedDownload(owner:string,subject:Subject,episode:string,url:string,download:BrowserDownload){const book=readDownloadQueue(owner);if(book.tasks.length>=100)return;book.tasks.push({id:crypto.randomUUID(),subject:{id:subject.id,name:subject.name,name_cn:subject.name_cn},episode:{name:episode,url},directUrl:url,state:'handed',createdAt:Date.now(),updatedAt:Date.now(),preparedAt:Date.now(),download});write(owner,book);}
export function pauseDownloadQueue(owner:string,paused:boolean){const book=readDownloadQueue(owner);book.paused=paused;write(owner,book);if(paused)active.get(owner)?.controller.abort();}
export function changeDownloadTask(owner:string,id:string,action:'cancel'|'retry'|'remove'){
 if(action==='remove'){const book=readDownloadQueue(owner);book.tasks=book.tasks.filter(task=>task.id!==id);write(owner,book);}else edit(owner,id,{state:action==='retry'?'queued':'cancelled',error:undefined,download:undefined});if(active.get(owner)?.id===id)active.get(owner)?.controller.abort();
}
export function handReadyDownloads(owner:string,ids?:string[]){
 const book=readDownloadQueue(owner);const tasks=book.tasks.filter(task=>task.state==='ready'&&task.download&&(!ids||ids.includes(task.id))).slice(0,3);let sent=0;
 for(const task of tasks){if(!task.preparedAt||Date.now()-task.preparedAt>7*3600000){edit(owner,task.id,{state:'queued',download:undefined,error:'链接已过期，正在重新准备'});continue;}handToBrowser(task.download!);edit(owner,task.id,{state:'handed',error:undefined});sent++;}return sent;
}
const wait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(signal.reason);return;}const abort=()=>{clearTimeout(timer);reject(signal.reason);},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
export async function runDownloadQueue(owner:string,signal:AbortSignal){
 if(!navigator.locks)throw Error('此浏览器不支持安全任务队列，请使用新版浏览器；单集下载仍可使用');
 await navigator.locks.request('lingqi-browser-download-queue:'+owner,{mode:'exclusive',ifAvailable:true},async lock=>{
  if(!lock)return;let book=readDownloadQueue(owner);if(book.paused||signal.aborted)return;
  for(const task of book.tasks)if(task.state==='preparing')edit(owner,task.id,{state:'queued'});
  let nextAt=0;
  while(!signal.aborted&&!readDownloadQueue(owner).paused){
   const task=readDownloadQueue(owner).tasks.find(task=>task.state==='queued');if(!task)return;if(nextAt>Date.now())await wait(nextAt-Date.now(),signal);if(signal.aborted||readDownloadQueue(owner).paused)return;
   const fresh=readDownloadQueue(owner).tasks.find(t=>t.id===task.id);if(fresh?.state!=='queued')continue;
   const controller=new AbortController(),combined=anySignal([signal,controller.signal,timeoutSignal(45000)]);active.set(owner,{id:task.id,controller});edit(owner,task.id,{state:'preparing',error:undefined});nextAt=Date.now()+5000;
   try{
    let address=task.directUrl,mediaType=task.mediaType;
    if(!address){const rule=validateRule(task.rule);publicUrl(task.episode.url);const resolved=await requestJson('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'resolve',rule,url:task.episode.url,source:task.source}),signal:combined});if(resolved.mode!=='video'||typeof resolved.url!=='string')throw Error(resolved.message||'这集未解析到视频，请到播放页更换线路');address=resolved.url;mediaType=resolved.mediaType;}
    const download=await prepareLocalDownload({url:address!,name:(task.subject.name_cn||task.subject.name)+' - '+task.episode.name,mediaType},combined);throwIfAborted(combined);if(readDownloadQueue(owner).tasks.find(t=>t.id===task.id)?.state==='preparing')edit(owner,task.id,{state:'ready',download,preparedAt:Date.now(),error:undefined});
   }catch(error){const current=readDownloadQueue(owner).tasks.find(t=>t.id===task.id);if(current?.state==='preparing')edit(owner,task.id,{state:controller.signal.aborted||signal.aborted?'queued':'failed',error:controller.signal.aborted||signal.aborted?undefined:combined.reason?.name==='TimeoutError'?'解析准备超时，请重试':(error as Error).message});}
   finally{if(active.get(owner)?.controller===controller)active.delete(owner);}
  }
 });
}
export function queueEventName(){return eventName;}
export function cancelStalePreparation(owner:string){const current=active.get(owner),book=readDownloadQueue(owner);if(current&&(book.paused||book.tasks.find(task=>task.id===current.id)?.state!=='preparing'))current.controller.abort();}
