import type {Subject} from './catalog';
import {validateRule,type Rule} from './web-core';

export type WatchRecord={subject:Subject;episode:string;url:string;time:number;position:number;source?:string;number?:number;ruleName?:string};
const text=(value:unknown)=>typeof value==='string'?value:undefined;
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
function subject(value:any):Subject|undefined {
 if(!value||!Number.isInteger(value.id)||value.id<0||typeof value.name!=='string'||!value.name.trim())return;
 return {id:value.id,name:value.name,name_cn:text(value.name_cn),summary:text(value.summary),date:text(value.date),air_date:text(value.air_date),eps:finite(value.eps),score:finite(value.score),rank:finite(value.rank),platform:text(value.platform),
  images:value.images?{large:text(value.images.large),common:text(value.images.common)}:undefined,
  rating:finite(value.rating?.score)!==undefined?{score:value.rating.score,rank:finite(value.rating.rank),total:finite(value.rating.total)}:undefined};
}
export function cleanCollection(value:unknown):Subject[]{
 return Array.isArray(value)?[...new Map(value.map(subject).filter((s):s is Subject=>!!s).map(s=>[s.id,s])).values()]:[];
}
export function cleanRules(value:unknown):Rule[]{
 return Array.isArray(value)?value.flatMap(rule=>{try{return [validateRule(rule)];}catch{return [];}}):[];
}
export function cleanHistory(value:unknown):WatchRecord[]{
 if(!Array.isArray(value))return [];
 return value.flatMap(item=>{
  const s=subject(item?.subject);if(!s||typeof item.url!=='string'||typeof item.episode!=='string'||finite(item.time)===undefined||finite(item.position)===undefined)return [];
  try{if(new URL(item.url).protocol!=='https:')return [];}catch{return [];}
  return [{subject:s,episode:item.episode,url:item.url,time:item.time,position:Math.max(0,item.position),source:text(item.source),number:finite(item.number),ruleName:text(item.ruleName)}];
 });
}
// Backups may be older than the local progress; equal timestamps keep the local copy.
export function mergeHistory(current:unknown,incoming:unknown):WatchRecord[]{
 const records=new Map<number,WatchRecord>();for(const item of [...cleanHistory(current),...cleanHistory(incoming)]){const old=records.get(item.subject.id);if(!old||item.time>old.time)records.set(item.subject.id,item);}
 return [...records.values()].sort((a,b)=>b.time-a.time).slice(0,100);
}
export function readStorage(key:string){try{return localStorage.getItem(key);}catch{return null;}}
export function writeStorage(key:string,value:string){try{localStorage.setItem(key,value);return true;}catch{return false;}}
