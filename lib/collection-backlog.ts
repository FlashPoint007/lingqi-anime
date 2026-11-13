import type {Subject} from './catalog';
import {collectionState} from './collection-state';
import type {WatchRecord} from './personal-data';
import type {SourceAvailability} from './source-availability';
import type {Rule} from './web-core';
import {knownEpisodeNumber,alignEpisodeNumbers} from './playback-client';
import {anySignal,requestJson,throwIfAborted,timeoutSignal} from './request-client';

export type BacklogEpisode={id:number;sort:number;airdate?:string;type?:number};
export type BacklogMetadata={data:BacklogEpisode[];total:number;complete:boolean;checkedAt:number;stale?:boolean};
export type BacklogEvidence={directory:Set<number>;verified:Set<number>;checked:boolean};
const metadataCache=new Map<number,BacklogMetadata>();
const evidenceCache=new Map<string,Map<string,{directory:(number|undefined)[][];verified:number[];checkedAt:number}>>();
const TTL=10*60*1000;
export function validAirdate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function backlogSubjects(items:Subject[]){return items.filter(s=>s.id>0&&['watching','planned'].includes(collectionState(s.collectionStatus)));}
// Public metadata only: viewing progress and source outcomes never enter this cache.
export async function loadBacklogMetadata(id:number,signal:AbortSignal,request:typeof requestJson=requestJson,now=Date.now(),force=false):Promise<BacklogMetadata>{
 if(!Number.isSafeInteger(id)||id<=0)throw Error('无效番剧');throwIfAborted(signal);
 const saved=metadataCache.get(id);if(!force&&saved&&!saved.stale&&now-saved.checkedAt>=0&&now-saved.checkedAt<TTL)return saved;
 const data:BacklogEpisode[]=[];let total=0,stale=false;
 try{
  // Long-running shows are explicitly partial after 300 entries. Never infer
  // unseen early episodes from the last played number or the subject's eps.
  for(let offset=0;offset<300;offset+=100){
   const result=await request('/api/episodes?id='+id+'&offset='+offset+(force?'&refresh=1':''),{...(force?{cache:'no-store' as const}:{}),signal:anySignal([signal,timeoutSignal(12000)])});throwIfAborted(signal);
   if(!Array.isArray(result.data)||!Number.isSafeInteger(result.total)||result.total<0)throw Error('剧集目录格式不正确');
   total=Math.max(total,result.total);stale=stale||result.cacheStale===true;
   const page=result.data.filter((e:any)=>e&&Number.isSafeInteger(e.id)&&e.id>0&&Number.isFinite(e.sort)&&e.sort>=0&&e.sort<=100000&&(e.type===undefined||e.type===0)).map((e:any)=>({id:e.id,sort:e.sort,...(validAirdate(e.airdate)?{airdate:e.airdate}:{}),...(e.type===0?{type:0}:{})}));
   if(result.data.length&&!page.length)throw Error('没有有效的正篇剧集');
   for(const episode of page)if(!data.some(e=>e.id===episode.id||e.sort===episode.sort))data.push(episode);
   if(offset+100>=total||!page.length)break;
  }
  const value={data:data.sort((a,b)=>a.sort-b.sort),total,complete:data.length>=total,checkedAt:now,...(stale?{stale:true}:{})};
  metadataCache.delete(id);metadataCache.set(id,value);while(metadataCache.size>120)metadataCache.delete(metadataCache.keys().next().value!);return value;
 }catch(error){if(signal.aborted)throw error;if(saved&&now-saved.checkedAt>=0&&now-saved.checkedAt<86400000)return {...saved,stale:true};throw error;}
}
function evidenceKey(subjectId:number,owner:string,rules:Rule[]){return JSON.stringify([owner,subjectId,rules.filter(r=>r.enabled!==false)]);}
// Short-lived, account-scoped observations. Nothing is persisted or scanned here.
export function rememberBacklogAvailability(subjectId:number,checks:Record<string,SourceAvailability>,owner:string|null,rules:Rule[],now=Date.now()){
 if(!owner||subjectId<=0)return;const key=evidenceKey(subjectId,owner,rules),book=evidenceCache.get(key)||new Map();
 for(const [name,check] of Object.entries(checks)){
  if(!check.checkedAt||!['found','playing','episode-error','not-found','error','possible'].includes(check.state))continue;
  const trusted=['found','playing','episode-error'].includes(check.state),directory=trusted?(check.roads||[]).slice(0,12).map(road=>road.episodes.slice(0,500).map(episode=>{const n=knownEpisodeNumber(episode);return n!==undefined&&n>=0&&n<=100000?n:undefined;})):[];
  const verified=check.state==='playing'&&Number.isFinite(check.episodeNumber)?[check.episodeNumber!]:[];
  book.set(name,{directory,verified,checkedAt:Math.min(now,check.checkedAt)});
 }
 evidenceCache.delete(key);evidenceCache.set(key,book);while(evidenceCache.size>160)evidenceCache.delete(evidenceCache.keys().next().value!);
}
export function readBacklogAvailability(subjectId:number,owner:string,rules:Rule[],now=Date.now(),metadataNumbers:number[]=[]):BacklogEvidence{
 const result:BacklogEvidence={directory:new Set(),verified:new Set(),checked:false};
 for(const [name,value] of evidenceCache.get(evidenceKey(subjectId,owner,rules))||[]){if(!rules.some(rule=>rule.name===name&&rule.enabled!==false)||now-value.checkedAt<0||now-value.checkedAt>=TTL)continue;result.checked=true;const roads=alignEpisodeNumbers(value.directory.map(numbers=>({name:'',episodes:numbers.map(number=>({name:'',url:'',number}))})),metadataNumbers);roads.forEach(road=>road.episodes.forEach(episode=>{const number=knownEpisodeNumber(episode);if(number!==undefined)result.directory.add(number);}));value.verified.forEach(n=>result.verified.add(n));}
 return result;
}
export function collectionBacklog(metadata:BacklogMetadata,record:WatchRecord|undefined,evidence:BacklogEvidence,now=Date.now()){
 const today=new Date(now+8*3600000).toISOString().slice(0,10),episodes=metadata.data.filter(e=>e.type===undefined||e.type===0);
 const aired=episodes.filter(e=>validAirdate(e.airdate)&&e.airdate<=today),pending=aired.filter(e=>record?.progresses?.[String(e.sort)]?.completed!==true);
 const uncertain=episodes.length===0||metadata.stale===true||!metadata.complete||episodes.some(e=>!validAirdate(e.airdate));
 return {aired:aired.length,pending:pending.length,unknownDates:episodes.filter(e=>!validAirdate(e.airdate)).length,uncertain,next:pending[0]?.sort,
  directory:pending.filter(e=>evidence.directory.has(e.sort)).length,verified:pending.filter(e=>evidence.verified.has(e.sort)).length,checked:evidence.checked};
}
