import {cleanCollection,cleanHistory,type WatchRecord} from './personal-data';
import type {Subject} from './catalog';
export type LibraryKind='collection'|'history';
export type LibraryValue=Subject|WatchRecord|null;
export type LibraryEntry={kind:LibraryKind;id:number;value:LibraryValue;version:number;updatedAt:number;sortAt:number};
export type LibraryChange={kind:LibraryKind;id:number;value:LibraryValue;expectedVersion:number;mutationId:string};
export type LibrarySnapshot={authenticated:boolean;account?:{id:string;displayName:string;provider?:'email'|'chatgpt'};entries:LibraryEntry[];accepted?:string[];conflicts?:string[];limited?:string[]};
export const entryKey=(entry:{kind:LibraryKind;id:number})=>entry.kind+':'+entry.id;
const clip=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):undefined;
function https(value:unknown,max=2048){if(typeof value!=='string'||value.length>max)return;try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!(u.pathname==='/api/media'&&u.searchParams.has('ticket')))return u.href;}catch{}}
export function librarySubject(value:unknown):Subject|undefined{
 const s=cleanCollection([value])[0];if(!s||!Number.isSafeInteger(s.id)||s.id>9999999999)return;
 const image=https(s.images?.large||s.images?.common,1024);
 return {id:s.id,...(s.collectionStatus?{collectionStatus:s.collectionStatus}:{}),name:s.name.slice(0,200),name_cn:clip(s.name_cn,200),date:clip(s.date,32),air_date:clip(s.air_date,32),eps:s.eps,score:s.score,rank:s.rank,platform:clip(s.platform,60),...(image?{images:{large:image}}:{}),...(s.rating?{rating:s.rating}:{})};
}
export function libraryValue(kind:LibraryKind,value:unknown):LibraryValue{
 if(value===null)return null;
 if(kind==='collection'){const s=librarySubject(value);if(!s)throw new Error('追番条目格式不正确');return s;}
 const h=cleanHistory([value])[0],subject=h&&librarySubject(h.subject),url=h&&https(h.url);if(!h||!subject||!url)throw new Error('观看记录格式不正确');
 return {subject,url,episode:h.episode.slice(0,200),time:Math.max(0,h.time),position:Math.min(7*86400,h.position),source:https(h.source),number:h.number,ruleName:clip(h.ruleName,100)};
}
export function visibleEntries(collection:Subject[],history:WatchRecord[]){
 const map=new Map<string,LibraryValue>();for(const value of collection){const s=librarySubject(value);if(s)map.set('collection:'+s.id,s);}for(const value of history){try{const h=libraryValue('history',value) as WatchRecord;map.set('history:'+h.subject.id,h);}catch{}}
 return map;
}
export const sameValue=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Validate the complete snapshot before replacing cached data or acknowledging
// an outbox. An HTTP 200 response alone is not proof that a mutation was saved.
export function parseLibrarySnapshot(value:any):LibrarySnapshot{
 if(!value||typeof value.authenticated!=='boolean'||!Array.isArray(value.entries))throw new Error('个人同步数据格式不正确，已保留待上传记录');
 if(!value.authenticated){if(value.entries.length)throw new Error('匿名同步数据格式不正确');return {authenticated:false,entries:[]};}
 if(!value.account||typeof value.account.id!=='string'||!value.account.id||value.account.id.length>512||typeof value.account.displayName!=='string'||value.account.displayName.length>1024)throw new Error('个人同步账号格式不正确');
 const keys=new Set<string>();const entries:LibraryEntry[]=value.entries.map((entry:any)=>{
  if(!entry||!['collection','history'].includes(entry.kind)||!Number.isSafeInteger(entry.id)||entry.id<0||entry.id>9999999999||!Number.isSafeInteger(entry.version)||entry.version<1||!Number.isFinite(entry.updatedAt)||entry.updatedAt<0||!Number.isFinite(entry.sortAt)||entry.sortAt<0)throw new Error('个人同步条目格式不正确');
  const clean=libraryValue(entry.kind,entry.value),id=entry.kind==='collection'?(clean as Subject)?.id:(clean as WatchRecord)?.subject.id;
  if(clean!==null&&id!==entry.id)throw new Error('个人同步条目 ID 不一致');const key=entryKey(entry);if(keys.has(key))throw new Error('个人同步条目重复');keys.add(key);
  return {kind:entry.kind,id:entry.id,value:clean,version:entry.version,updatedAt:entry.updatedAt,sortAt:entry.sortAt};
 });
 const acknowledgements:Pick<LibrarySnapshot,'accepted'|'conflicts'|'limited'>={};
 for(const key of ['accepted','conflicts','limited'] as const){if(value[key]===undefined)continue;if(!Array.isArray(value[key])||value[key].some((id:unknown)=>typeof id!=='string'||!/^[-\w]{16,80}$/.test(id)))throw new Error('同步确认格式不正确，已保留待上传记录');acknowledgements[key]=value[key];}
 return {authenticated:true,account:{id:value.account.id,displayName:value.account.displayName,...(['email','chatgpt'].includes(value.account.provider)?{provider:value.account.provider}:{})},entries,...acknowledgements};
}
