import {currentSeason,normalizeCalendar} from './catalog';
import {readStorage,writeStorage} from './personal-data';
const KEY='kw-season-cache-v1',memory=new Map<string,any>();
function valid(value:any,year:number,quarter:number){try{if(!value||value.year!==year||value.quarter!==quarter||!Number.isFinite(value.savedAt)||value.savedAt>Date.now()+60000||Date.now()-value.savedAt>7*86400000||!['current','premiere'].includes(value.basis))return;if(value.basis==='current'&&(year!==currentSeason().year||quarter!==currentSeason().quarter))return;return {...value,calendar:normalizeCalendar(value.calendar)};}catch{return;}}
export function readSeasonCache(year:number,quarter:number){const key=year+':'+quarter;const cached=valid(memory.get(key),year,quarter);if(cached)return cached;try{return valid(JSON.parse(readStorage(KEY)||'{}')[key],year,quarter);}catch{return;}}
export function seasonCacheFresh(value:any){return !!value&&!value.cacheStale&&Date.now()-value.savedAt<300000;}
export function seasonData(data:any,year:number,quarter:number){if(data?.year!==year||data?.quarter!==quarter)throw Error('放送时间表季度不匹配，请重试');const value=valid({...data,savedAt:Date.now()},year,quarter);if(!value)throw Error('放送时间表格式不正确，请重试');return value;}
export function saveSeasonCache(year:number,quarter:number,data:any){
 const value=valid({...data,year,quarter,savedAt:Date.now()},year,quarter);if(!value)return;
 const key=year+':'+quarter;memory.delete(key);memory.set(key,value);while(memory.size>4)memory.delete(memory.keys().next().value!);
 let stored:any={};try{stored=JSON.parse(readStorage(KEY)||'{}')||{};}catch{}
 const entries=([[key,value],...Object.entries(stored).filter(([storedKey])=>storedKey!==key)] as [string,any][]).filter(([key,value]:any)=>/^\d{4}:[1-4]$/.test(key)&&valid(value,Number(key.split(':')[0]),Number(key.split(':')[1]))).sort((a:any,b:any)=>b[1].savedAt-a[1].savedAt).slice(0,4);
 let text=JSON.stringify(Object.fromEntries(entries));while(text.length>700000&&entries.length>1){entries.pop();text=JSON.stringify(Object.fromEntries(entries));}if(text.length<=700000)writeStorage(KEY,text);
}
