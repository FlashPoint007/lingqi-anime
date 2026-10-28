import {normalizeSubjects,type Subject} from './catalog';

export const FEATURE_LIMIT=6;
export type FeatureSeason={year:number;quarter:number};
export type FeatureData=FeatureSeason&{data:Subject[];cacheStale:boolean};
// Recommendations use calendar quarters, separately from Kazumi's weekly feed.
export function featureRange(year:number,quarter:number){
 if(!Number.isInteger(year)||year<1900||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4)throw Error('无效的推荐季度');
 const date=(month:number)=>new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
 return {start:date((quarter-1)*3),end:date(quarter*3)};
}
export function featureToday(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function featureSubjects(raw:unknown,year:number,quarter:number,now=new Date()){
 const {start,end}=featureRange(year,quarter),today=featureToday(now);
 if(!Array.isArray(raw))throw Error('季度热门数据格式不正确');
 return normalizeSubjects(raw.filter(s=>s&&s.nsfw!==true&&(s.type===undefined||s.type===2))).filter(s=>{
  const date=s.date||s.air_date||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>=end||date>today)return false;
  const parsed=new Date(date+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
 }).slice(0,FEATURE_LIMIT);
}
export function featureData(raw:any,year:number,quarter:number):FeatureData{
 if(raw?.year!==year||raw?.quarter!==quarter||!Array.isArray(raw.data)||raw.data.length>FEATURE_LIMIT)throw Error('季度热门与所选季度不匹配');
 const data=featureSubjects(raw.data,year,quarter);
 if(data.length!==raw.data.length)throw Error('季度热门包含无效或其他季度的条目');
 return {year,quarter,data,cacheStale:raw.cacheStale===true};
}
