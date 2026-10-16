import {cleanCollection,cleanHistory,type WatchRecord} from './personal-data';
import type {Subject} from './catalog';
export type LibraryKind='collection'|'history';
export type LibraryValue=Subject|WatchRecord|null;
export type LibraryEntry={kind:LibraryKind;id:number;value:LibraryValue;version:number;updatedAt:number;sortAt:number};
export type LibraryChange={kind:LibraryKind;id:number;value:LibraryValue;expectedVersion:number;mutationId:string};
export type LibrarySnapshot={authenticated:boolean;account?:{id:string;displayName:string};entries:LibraryEntry[];accepted?:string[];conflicts?:string[];limited?:string[]};
export const entryKey=(entry:{kind:LibraryKind;id:number})=>entry.kind+':'+entry.id;
const clip=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):undefined;
function https(value:unknown,max=2048){if(typeof value!=='string'||value.length>max)return;try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!(u.pathname==='/api/media'&&u.searchParams.has('ticket')))return u.href;}catch{}}
export function librarySubject(value:unknown):Subject|undefined{
 const s=cleanCollection([value])[0];if(!s||!Number.isSafeInteger(s.id)||s.id>9999999999)return;
 const image=https(s.images?.large||s.images?.common,1024);
 return {id:s.id,name:s.name.slice(0,200),name_cn:clip(s.name_cn,200),date:clip(s.date,32),air_date:clip(s.air_date,32),eps:s.eps,score:s.score,rank:s.rank,platform:clip(s.platform,60),...(image?{images:{large:image}}:{}),...(s.rating?{rating:s.rating}:{})};
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
