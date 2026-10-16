import {entryKey,libraryValue,sameValue,visibleEntries,type LibraryChange,type LibraryEntry,type LibrarySnapshot,type LibraryValue} from './library-model';
import type {Subject} from './catalog';
import type {WatchRecord} from './personal-data';
export type SyncPhase='saved'|'pending'|'saving'|'error';
type Options={request:(changes?:LibraryChange[])=>Promise<LibrarySnapshot>;apply:(collection:Subject[],history:WatchRecord[])=>void;persist:(pending:LibraryChange[],snapshot:LibrarySnapshot)=>void;status:(phase:SyncPhase,message?:string)=>void;accountChanged:(snapshot:LibrarySnapshot)=>void};
export function restoreChanges(value:unknown):LibraryChange[]{
 if(!Array.isArray(value))return [];
 return value.slice(0,2000).flatMap(change=>{try{if(!change||!['collection','history'].includes(change.kind)||!Number.isSafeInteger(change.id)||change.id<0||!Number.isSafeInteger(change.expectedVersion)||change.expectedVersion<0||!/^[-\w]{16,80}$/.test(change.mutationId))return [];return [{...change,value:libraryValue(change.kind,change.value)}];}catch{return [];}});
}
const mutationId=()=>crypto.randomUUID();
export class LibrarySync{
 private entries=new Map<string,LibraryEntry>();private pending=new Map<string,LibraryChange>();private visible=new Map<string,LibraryValue>();private work:Promise<void>|null=null;private stopped=false;private refreshing=false;
 constructor(private snapshot:LibrarySnapshot,private options:Options,legacy:{collection:Subject[];history:WatchRecord[]},outbox:LibraryChange[]=[]){
  this.replace(snapshot);for(const change of outbox)this.pending.set(entryKey(change),change);
  for(const [key,value] of visibleEntries(legacy.collection,legacy.history)){
   const old=this.entries.get(key);if(this.pending.has(key)||old?.value===null)continue;
   // Existing cloud favourites win; migrate only new favourites or newer progress.
   if(!old||(old.kind==='history'&&(value as WatchRecord).time>(old.value as WatchRecord).time)){
    const [kind,id]=key.split(':');this.pending.set(key,{kind:kind as 'collection'|'history',id:Number(id),value,expectedVersion:old?.version||0,mutationId:mutationId()});
   }
  }
  this.render();this.persist();
 }
 private replace(snapshot:LibrarySnapshot){this.snapshot=snapshot;this.entries=new Map(snapshot.entries.map(entry=>[entryKey(entry),entry]));}
 private persist(){this.options.persist([...this.pending.values()],this.snapshot);this.options.status(this.pending.size?'pending':'saved');}
 private render(){
  const values=new Map<string,LibraryValue>([...this.entries].map(([key,entry])=>[key,entry.value]));for(const [key,change] of this.pending)values.set(key,change.value);
  this.visible=new Map([...values].filter(([,value])=>value!==null));
  const collection=[...this.visible].filter(([key])=>key.startsWith('collection:')).sort(([a],[b])=>(this.entries.get(b)?.sortAt||Date.now())-(this.entries.get(a)?.sortAt||Date.now())).map(([,value])=>value as Subject);
  const history=[...this.visible].filter(([key])=>key.startsWith('history:')).map(([,value])=>value as WatchRecord).sort((a,b)=>b.time-a.time).slice(0,100);
  this.options.apply(collection,history);
 }
 observe(collection:Subject[],history:WatchRecord[]){
  if(this.stopped)return;const next=visibleEntries(collection,history);let changed=false;
  for(const key of new Set([...next.keys(),...this.visible.keys()])){const value=next.get(key)??null;if(sameValue(value,this.visible.get(key)??null))continue;changed=true;const [kind,id]=key.split(':');this.pending.set(key,{kind:kind as 'collection'|'history',id:Number(id),value,expectedVersion:this.entries.get(key)?.version||0,mutationId:mutationId()});}
  this.visible=next;if(changed)this.persist();
 }
 get hasPending(){return this.pending.size>0;}
 get isBusy(){return !!this.work||this.refreshing;}
 get changes(){return [...this.pending.values()];}
 flush(){if(this.work)return this.work;if(this.stopped||this.refreshing||!this.pending.size)return Promise.resolve();const task=this.save();this.work=task;return task.finally(()=>{if(this.work===task)this.work=null;});}
 private async save(){
  this.options.status('saving');
  try{
   while(this.pending.size&&!this.stopped){
    const batch:LibraryChange[]=[];let bytes=0;for(const change of this.pending.values()){const size=new TextEncoder().encode(JSON.stringify(change)).length;if(batch.length>=50||bytes+size>200000)break;batch.push(change);bytes+=size;}if(!batch.length)throw new Error('待同步记录过大，请导出备份后重试');
    const next=await this.options.request(batch);if(this.stopped)return;if(!next.authenticated||next.account?.id!==this.snapshot.account?.id){this.options.accountChanged(next);return;}
    this.replace(next);const accepted=new Set(next.accepted||[]);
    for(const sent of batch){const key=entryKey(sent),current=this.pending.get(key);if(!current)continue;if(current.mutationId===sent.mutationId)this.pending.delete(key);else if(accepted.has(sent.mutationId))current.expectedVersion=this.entries.get(key)?.version||0;else this.pending.delete(key);}
    this.render();this.persist();if(next.limited?.length)this.options.status('error','追番数量已达 1000 条上限，部分条目未保存');else if(next.conflicts?.length)this.options.status('saved','部分记录版本已更新，已保留数据库中的最新记录');
   }
  }catch(error){if(!this.stopped){this.options.persist([...this.pending.values()],this.snapshot);this.options.status('error',(error as Error).message||'同步失败，待上传记录已保留');}}
 }
 async refresh(){
  if(this.stopped||this.work||this.refreshing)return;this.refreshing=true;
  try{const next=await this.options.request();if(this.stopped)return;if(!next.authenticated||next.account?.id!==this.snapshot.account?.id){this.options.accountChanged(next);return;}this.replace(next);this.render();this.persist();}catch(error){if(!this.stopped)this.options.status('error',(error as Error).message);}finally{this.refreshing=false;if(!this.stopped&&this.pending.size)void this.flush();}
 }
 stop(){this.stopped=true;}
}
