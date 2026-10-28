import {featureData,type FeatureData} from './home-feature';
import {readStorage,writeStorage} from './personal-data';
const KEY='kw-home-features-v1',MAX_AGE=86400000,memory=new Map<string,FeatureCache>();
type FeatureCache=FeatureData&{savedAt:number};
function valid(raw:any,year:number,quarter:number):FeatureCache|undefined{
 try{if(!Number.isFinite(raw?.savedAt)||raw.savedAt>Date.now()+60000||Date.now()-raw.savedAt>MAX_AGE)return;return {...featureData(raw,year,quarter),savedAt:raw.savedAt};}catch{return;}
}
export function readFeatureCache(year:number,quarter:number){
 const key=year+':'+quarter,hit=valid(memory.get(key),year,quarter);if(hit)return hit;
 try{return valid(JSON.parse(readStorage(KEY)||'{}')[key],year,quarter);}catch{return;}
}
export function featureCacheFresh(value:FeatureCache|undefined){return !!value&&!value.cacheStale&&Date.now()-value.savedAt<300000;}
export function saveFeatureCache(value:FeatureData){
 const saved=valid({...value,savedAt:Date.now()},value.year,value.quarter);if(!saved)return;
 const key=value.year+':'+value.quarter;memory.delete(key);memory.set(key,saved);while(memory.size>4)memory.delete(memory.keys().next().value!);
 let old:any={};try{old=JSON.parse(readStorage(KEY)||'{}')||{};}catch{}
 const entries=([[key,saved],...Object.entries(old).filter(([k])=>k!==key)] as [string,any][]).filter(([k,v])=>/^\d{4}:[1-4]$/.test(k)&&valid(v,Number(k.split(':')[0]),Number(k.split(':')[1]))).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,4);
 const text=JSON.stringify(Object.fromEntries(entries));if(text.length<=160000)writeStorage(KEY,text);
}
