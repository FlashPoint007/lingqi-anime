import {normalizeSubjects,PAGE_SIZE} from './catalog';
import {readStorage,writeStorage} from './personal-data';
const KEY='kw-browse-cache-v1',MAX_AGE=86400000,memory=new Map<string,BrowseCache>();
export type BrowseData={data:ReturnType<typeof normalizeSubjects>;total:number;page:number;offline:boolean;searchLimited:boolean;cacheStale:boolean};
type BrowseCache=BrowseData&{savedAt:number};
export function browseData(value:any):BrowseData{
 if(!value||!Number.isSafeInteger(value.total)||value.total<0||!Number.isSafeInteger(value.page)||value.page<1)throw Error('番剧列表格式不正确，请重试');
 const data=normalizeSubjects(value.data);if(data.length>PAGE_SIZE)throw Error('番剧列表分页格式不正确，请重试');
 return {data,total:value.total,page:value.page,offline:value.offline===true,searchLimited:value.searchLimited===true,cacheStale:value.cacheStale===true};
}
function valid(value:any,key:string):BrowseCache|undefined{try{const params=new URLSearchParams(key);if(!Number.isFinite(value?.savedAt)||value.savedAt>Date.now()+60000||Date.now()-value.savedAt>MAX_AGE||Number(params.get('page'))!==value.page||value.offline)return;return {...browseData(value),savedAt:value.savedAt};}catch{return;}}
export function readBrowseCache(key:string){const hit=valid(memory.get(key),key);if(hit)return hit;try{const hit=valid(JSON.parse(readStorage(KEY)||'{}')[key],key);if(hit)remember(key,hit);return hit;}catch{return;}}
function remember(key:string,value:BrowseCache){memory.delete(key);memory.set(key,value);while(memory.size>12)memory.delete(memory.keys().next().value!);}
export function browseCacheFresh(value:BrowseCache|undefined){return !!value&&!value.cacheStale&&Date.now()-value.savedAt<120000;}
export function saveBrowseCache(key:string,data:unknown){
 const value=valid({...browseData(data),savedAt:Date.now()},key);if(!value)return;
 remember(key,value);let stored:any={};try{stored=JSON.parse(readStorage(KEY)||'{}')||{};}catch{}
 const entries=([[key,value],...Object.entries(stored).filter(([k])=>k!==key)] as [string,any][]).filter(([k,v])=>valid(v,k)).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,6);
 let text=JSON.stringify(Object.fromEntries(entries));while(text.length>700000&&entries.length>1){entries.pop();text=JSON.stringify(Object.fromEntries(entries));}if(text.length<=700000)writeStorage(KEY,text);
}
