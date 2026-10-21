export type EpisodeProgress={position:number;duration:number;updatedAt:number;completed:boolean};
export type EpisodeProgresses=Record<string,EpisodeProgress>;
export const MAX_EPISODE_PROGRESS=200;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function episodeKey(number:unknown){return finite(number)&&number>0&&number<=100000&&/^\d+(?:\.\d{1,3})?$/.test(String(number))?String(number):undefined;}
export function cleanProgresses(value:unknown):EpisodeProgresses{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).slice(0,2000).flatMap(([key,v]:[string,any])=>{
  if(episodeKey(Number(key))!==key||!v||!finite(v.position)||v.position<0||!finite(v.updatedAt)||v.updatedAt<0)return [];
  const duration=finite(v.duration)&&v.duration>0?Math.min(v.duration,604800):0;
  return [[key,{position:Math.min(v.position,604800),duration,updatedAt:Math.min(v.updatedAt,Date.now()+60000),completed:v.completed===true}]] as [string,EpisodeProgress][];
 }).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,MAX_EPISODE_PROGRESS));
}
export function mergeProgresses(...maps:unknown[]):EpisodeProgresses{
 const merged:EpisodeProgresses={};for(const map of maps)for(const [key,value] of Object.entries(cleanProgresses(map))){if(!merged[key]||value.updatedAt>merged[key].updatedAt)merged[key]=value;}
 return cleanProgresses(merged);
}
export function withEpisodeProgress<T extends {number?:number;position:number;time:number;progresses?:EpisodeProgresses}>(record:T,duration=0,ended=false):T{
 const key=episodeKey(record.number);if(!key)return record;const before=record.progresses?.[key];
 const length=finite(duration)&&duration>0?duration:before?.duration||0;
 return {...record,progresses:mergeProgresses({[key]:{position:record.position,duration:length,updatedAt:record.time,completed:before?.completed===true||ended||(length>0&&record.position>=length*.95)}},record.progresses)};
}
export function episodeStats(records:{progresses?:EpisodeProgresses}[]){let watched=0,completed=0;for(const record of records)for(const progress of Object.values(record.progresses||{})){if(progress.position>0||progress.completed)watched++;if(progress.completed)completed++;}return {watched,completed};}
