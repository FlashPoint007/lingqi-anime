import {defaultDanmakuSettings,type DanmakuSettings} from './danmaku';
import {type SubjectAliases,type AliasRecord} from './subject-aliases';
import {valueSubjectId,entryKey,libraryValue,parseLibrarySnapshot,sameValue,visibleEntries,type LibraryChange,type LibraryEntry,type LibrarySnapshot,type LibraryValue,type DanmakuRecord} from './library-model';
import type {Subject} from './catalog';
import type {WatchRecord} from './personal-data';
import {mergeHistory} from './personal-data';
export type SyncPhase='saved'|'pending'|'saving'|'error';
type Options={request:(changes?:LibraryChange[])=>Promise<LibrarySnapshot>;apply:(collection:Subject[],history:WatchRecord[],aliases:SubjectAliases,settings:DanmakuSettings)=>void;persist:(pending:LibraryChange[],snapshot:LibrarySnapshot)=>void;status:(phase:SyncPhase,message?:string)=>void;accountChanged:(snapshot:LibrarySnapshot)=>void};
export function restoreChanges(value:unknown):LibraryChange[]{
 if(!Array.isArray(value))return [];
 const restored=new Map<string,LibraryChange>();
 for(const change of value){try{
  if(!change||!['collection','history','aliases','danmaku'].includes(change.kind)||!Number.isSafeInteger(change.id)||change.id<0||change.id>9999999999||!Number.isSafeInteger(change.expectedVersion)||change.expectedVersion<0||typeof change.mutationId!=='string'||!/^[-\w]{16,80}$/.test(change.mutationId))continue;
  if(change.kind==='danmaku'&&change.id!==0)continue;
  const clean=libraryValue(change.kind,change.value);if(clean!==null&&valueSubjectId(change.kind,clean)!==change.id)continue;
  const normalized:LibraryChange={kind:change.kind,id:change.id,expectedVersion:change.expectedVersion,mutationId:change.mutationId,value:clean},key=entryKey(normalized);
  if((restored.get(key)?.expectedVersion??-1)>normalized.expectedVersion)continue;
  restored.delete(key);restored.set(key,normalized);
 }catch{/* Corrupt entries cannot replace valid queued changes. */}}
 return [...restored.values()];
}
const mutationId=()=>crypto.randomUUID();
export class LibrarySync{
 private entries=new Map<string,LibraryEntry>();private pending=new Map<string,LibraryChange>();private visible=new Map<string,LibraryValue>();private work:Promise<void>|null=null;private stopped=false;private refreshing=false;
 constructor(private snapshot:LibrarySnapshot,private options:Options,legacy:{collection:Subject[];history:WatchRecord[];aliases?:SubjectAliases;settings?:DanmakuSettings},outbox:LibraryChange[]=[]){
  this.replace(snapshot);for(const change of outbox)this.pending.set(entryKey(change),change);
  for(const [key,value] of visibleEntries(legacy.collection,legacy.history,legacy.aliases,legacy.settings)){
   const old=this.entries.get(key);if(this.pending.has(key)||old?.value===null)continue;
   // Existing cloud favourites win; migrate only new favourites or newer progress.
   if(!old||(old.kind==='history'&&(value as WatchRecord).time>(old.value as WatchRecord).time)){
    const [kind,id]=key.split(':');this.pending.set(key,{kind:kind as 'collection'|'history'|'aliases'|'danmaku',id:Number(id),value,expectedVersion:old?.version||0,mutationId:mutationId()});
   }
  }
  this.render();this.persist();
 }
 private replace(snapshot:LibrarySnapshot){const valid=parseLibrarySnapshot(snapshot);this.entries=new Map(valid.entries.map(entry=>[entryKey(entry),entry]));this.snapshot=valid;}
 private persist(){this.options.persist([...this.pending.values()],this.snapshot);this.options.status(this.pending.size?'pending':'saved');}
 private render(){
  const values=new Map<string,LibraryValue>([...this.entries].map(([key,entry])=>[key,entry.value]));for(const [key,change] of this.pending)values.set(key,change.value);
  this.visible=new Map([...values].filter(([,value])=>value!==null));
  const collection=[...this.visible].filter(([key])=>key.startsWith('collection:')).sort(([a],[b])=>(this.entries.get(b)?.sortAt||Date.now())-(this.entries.get(a)?.sortAt||Date.now())).map(([,value])=>value as Subject);
  const history=[...this.visible].filter(([key])=>key.startsWith('history:')).map(([,value])=>value as WatchRecord).sort((a,b)=>b.time-a.time).slice(0,100);
  const aliases=Object.fromEntries([...this.visible].filter(([key])=>key.startsWith('aliases:')).map(([,value])=>{const a=value as AliasRecord;return [String(a.subjectId),a.aliases];}));this.options.apply(collection,history,aliases,(this.visible.get('danmaku:0') as DanmakuRecord|undefined)?.settings||defaultDanmakuSettings);
 }
 observe(collection:Subject[],history:WatchRecord[],aliases?:SubjectAliases,settings?:DanmakuSettings){
  if(this.stopped)return;const retained=Object.fromEntries([...this.visible].filter(([key])=>key.startsWith('aliases:')).map(([,value])=>{const a=value as AliasRecord;return [String(a.subjectId),a.aliases];}));const next=visibleEntries(collection,history,aliases??retained,settings||(this.visible.get('danmaku:0') as DanmakuRecord|undefined)?.settings);let changed=false;
  for(const key of new Set([...next.keys(),...this.visible.keys()])){const value=next.get(key)??null;if(sameValue(value,this.visible.get(key)??null))continue;changed=true;const [kind,id]=key.split(':');this.pending.set(key,{kind:kind as 'collection'|'history'|'aliases'|'danmaku',id:Number(id),value,expectedVersion:this.entries.get(key)?.version||0,mutationId:mutationId()});}
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
    const next=parseLibrarySnapshot(await this.options.request(batch));if(this.stopped)return;if(!next.authenticated||next.account?.id!==this.snapshot.account?.id){this.options.accountChanged(next);return;}
    const confirmed=[...(next.accepted||[]),...(next.conflicts||[]),...(next.limited||[])],ids=new Set(batch.map(change=>change.mutationId));
    if(confirmed.length!==batch.length||new Set(confirmed).size!==batch.length||confirmed.some(id=>!ids.has(id)))throw new Error('同步确认不完整，待上传记录已保留，请重试');
    const received=new Map(next.entries.map(entry=>[entryKey(entry),entry]));for(const sent of batch)if(next.accepted?.includes(sent.mutationId)&&(received.get(entryKey(sent))?.version||0)<=sent.expectedVersion)throw new Error('同步结果缺少已保存记录，待上传记录已保留，请重试');
    this.replace(next);const accepted=new Set(next.accepted||[]),limited=new Set(next.limited||[]);
    for(const sent of batch){if(limited.has(sent.mutationId))continue;const key=entryKey(sent),current=this.pending.get(key);if(!current)continue;
     const remote=this.entries.get(key);if(next.conflicts?.includes(sent.mutationId)&&current.kind==='history'&&current.value&&remote?.value){
      const merged=mergeHistory([current.value],[remote.value])[0];if(!sameValue(merged,remote.value)){this.pending.set(key,{...current,value:merged,expectedVersion:remote.version,mutationId:mutationId()});continue;}
     }
     if(current.mutationId===sent.mutationId)this.pending.delete(key);else if(accepted.has(sent.mutationId))current.expectedVersion=this.entries.get(key)?.version||0;else this.pending.delete(key);}
    this.render();this.persist();if(limited.size){this.options.status('error','追番或别名记录已达 1000 部上限；待上传条目已保留，可导出备份或移除部分追番后重试');return;}else if(next.conflicts?.length)this.options.status('saved','部分记录版本已更新，已保留数据库中的最新记录');
   }
  }catch(error){if(!this.stopped){this.options.persist([...this.pending.values()],this.snapshot);this.options.status('error',(error as Error).message||'同步失败，待上传记录已保留');}}
 }
 async refresh(){
  if(this.stopped||this.work||this.refreshing)return;this.refreshing=true;
  try{const next=parseLibrarySnapshot(await this.options.request());if(this.stopped)return;if(!next.authenticated||next.account?.id!==this.snapshot.account?.id){this.options.accountChanged(next);return;}this.replace(next);this.render();this.persist();}catch(error){if(!this.stopped)this.options.status('error',(error as Error).message);}finally{this.refreshing=false;if(!this.stopped&&this.pending.size)void this.flush();}
 }
 stop(){this.stopped=true;}
}
