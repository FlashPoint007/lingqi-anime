'use client';
import {useEffect,useRef,useState} from 'react';
import {LibrarySync,restoreChanges,type SyncPhase} from '../lib/library-sync';
import {requestJson,timeoutSignal,anySignal} from '../lib/request-client';
import {cleanCollection,mergeHistory,readStorage,writeStorage,type WatchRecord} from '../lib/personal-data';
import type {Subject} from '../lib/catalog';
import {parseLibrarySnapshot} from '../lib/library-model';
import type {LibraryChange,LibrarySnapshot} from '../lib/library-model';
const read=(key:string,fallback:any)=>{try{return JSON.parse(readStorage(key)||'null')??fallback;}catch{return fallback;}};
export default function useLibrarySync(ready:boolean,collection:Subject[],history:WatchRecord[],apply:(collection:Subject[],history:WatchRecord[])=>void){
 const [state,setState]=useState<{ready:boolean;phase:SyncPhase|'checking'|'anonymous';message:string;account?:{id:string;displayName:string;provider?:'email'|'chatgpt'}}>({ready:false,phase:'checking',message:'正在读取个人数据库…'});
 const engine=useRef<LibrarySync|null>(null),latest=useRef({collection,history,apply}),retryRef=useRef<()=>void>(()=>{}),owner=useRef<string|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),storageFailed=useRef(false);
 latest.current={collection,history,apply};
 const save=(key:string,value:unknown)=>{if(!writeStorage(key,JSON.stringify(value))){storageFailed.current=true;setState(old=>({...old,message:'浏览器暂存失败，请保持页面打开，待数据库同步完成后再离开'}));}};
 useEffect(()=>{
  if(!ready)return;let alive=true,loading=false;const controller=new AbortController();
  const request=async(changes?:LibraryChange[]):Promise<LibrarySnapshot>=>{const body=changes?JSON.stringify({changes,accountId:owner.current}):undefined;return parseLibrarySnapshot(await requestJson('/api/library',{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:new TextEncoder().encode(body).length<60000}:{}),cache:'no-store',signal:anySignal([controller.signal,timeoutSignal(15000)])}));};
  const local=(key:string)=>{const data=read(key,{collection:[],history:[]});return {collection:cleanCollection(data.collection),history:mergeHistory([],data.history)};};
  const activate=(snapshot:LibrarySnapshot)=>{
   if(!alive)return;snapshot=parseLibrarySnapshot(snapshot);engine.current?.stop();engine.current=null;clearTimeout(timer.current);const previous=read('kw-library-owner',null);
   if(!snapshot.authenticated){owner.current='anonymous';const data=local('kw-library-cache:anonymous');if(previous===null){data.collection=cleanCollection(read('kw-collection',[]));data.history=mergeHistory([],read('kw-history',[]));}owner.current='anonymous';save('kw-library-owner','anonymous');latest.current.apply(data.collection,data.history);setState({ready:true,phase:'anonymous',message:'尚未同步到数据库；登录后自动保存追番与观看进度'});return;}
   if(!snapshot.account||!Array.isArray(snapshot.entries))throw new Error('个人数据库返回的数据格式不正确');
   const id=snapshot.account.id;owner.current=id;
   let legacy={collection:[] as Subject[],history:[] as WatchRecord[]};
   if(previous===null)legacy={collection:cleanCollection(read('kw-collection',[])),history:mergeHistory([],read('kw-history',[]))};else if(previous==='anonymous')legacy=local('kw-library-cache:anonymous');
   save('kw-library-owner',id);
   const outbox=restoreChanges(read('kw-library-outbox:'+id,[]));
   let knownPending=new Set(outbox.map(change=>change.mutationId));
   const sync=new LibrarySync(snapshot,{
    request,apply:(collection,history)=>{if(!alive)return;save('kw-library-cache:'+id,{collection,history});save('kw-collection',collection);save('kw-history',history);latest.current.apply(collection,history);},
    persist:(pending,snapshot)=>{if(alive){const foreign=restoreChanges(read('kw-library-outbox:'+id,[])).filter(change=>!knownPending.has(change.mutationId));const merged=restoreChanges([...foreign,...pending]);save('kw-library-outbox:'+id,merged);save('kw-library-snapshot:'+id,snapshot);knownPending=new Set(pending.map(change=>change.mutationId));}},
    status:(phase,message)=>{if(alive)setState({ready:true,account:snapshot.account,phase,message:storageFailed.current&&phase!=='saved'?'浏览器暂存失败，请保持页面打开，等待数据库保存':message||(phase==='saved'?'追番与观看记录已保存到数据库':phase==='saving'?'正在保存到数据库…':'有更新等待同步…')});},
    accountChanged:next=>{if(alive)activate(next);},
   },legacy,outbox);engine.current=sync;
   // Migration transfers these records to this account's durable outbox. Leave
   // a clean anonymous space on sign-out so another account cannot inherit them.
   if(previous==='anonymous'&&!storageFailed.current)save('kw-library-cache:anonymous',{collection:[],history:[]});
   if(sync.hasPending)void sync.flush();
  };
  const load=async()=>{if(loading||!alive)return;loading=true;try{activate(await request());}catch(error){if(alive){const previous=read('kw-library-owner',null),cached=previous&&read('kw-library-snapshot:'+previous,null);let restored=false;if(cached?.authenticated&&cached.account?.id===previous){try{activate(cached);restored=true;}catch{/* Invalid local snapshots must not leave the personal area stuck loading. */}}if(!restored)activate({authenticated:false,entries:[]});setState(old=>({...old,phase:'error',message:(error as Error).message+'；当前更改会暂存并重试'}));}}finally{loading=false;}};
  retryRef.current=()=>{if(engine.current)void engine.current.refresh();else void load();};
  void load();
  const refresh=()=>{if(document.visibilityState==='hidden')return;retryRef.current();};
  const hide=()=>{if(document.visibilityState!=='hidden')return;const sync=engine.current;if(sync){sync.observe(latest.current.collection,latest.current.history);void sync.flush();}};
  const interval=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',hide);
  return()=>{alive=false;controller.abort();engine.current?.stop();engine.current=null;clearInterval(interval);clearTimeout(timer.current);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',hide);};
 },[ready]);
 useEffect(()=>{
  if(!state.ready)return;
  if(owner.current==='anonymous'){save('kw-library-cache:anonymous',{collection,history});save('kw-collection',collection);save('kw-history',history);return;}
  const sync=engine.current;if(!sync)return;sync.observe(collection,history);clearTimeout(timer.current);if(sync.hasPending)timer.current=setTimeout(()=>void sync.flush(),750);
 },[collection,history]);
 return {...state,retry:()=>retryRef.current(),flush:(nextHistory?:WatchRecord[])=>{if(nextHistory)latest.current.history=nextHistory;const current=latest.current;if(owner.current==='anonymous'){save('kw-library-cache:anonymous',{collection:current.collection,history:current.history});save('kw-history',current.history);}engine.current?.observe(current.collection,current.history);return engine.current?.flush();}};
}
