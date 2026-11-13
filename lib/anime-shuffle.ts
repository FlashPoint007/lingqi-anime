import type {Subject} from './catalog';
import {collectionState} from './collection-state';

export type ShufflePool='list'|'collection';
export type ShuffleRound={seen:number[];current?:number};
// A catalogue row can contain an old collection status. The current personal
// collection is authoritative, including a change back from completed to watching.
export function shuffleCandidates(items:Subject[],collection:Subject[],pool:ShufflePool):Subject[]{
 const statuses=new Map(collection.map(subject=>[subject.id,collectionState(subject.collectionStatus)]));
 const candidates=pool==='collection'?collection:items,seen=new Set<number>();
 return candidates.filter(subject=>{
  if(!Number.isSafeInteger(subject.id)||subject.id<=0||seen.has(subject.id)||!(subject.name_cn||subject.name||'').trim())return false;
  const status=statuses.get(subject.id)??(subject.collectionStatus?collectionState(subject.collectionStatus):undefined);
  if(status==='completed'||status==='dropped'||pool==='collection'&&status!=='watching'&&status!=='planned')return false;
  seen.add(subject.id);return true;
 });
}
// Exhaust the current bag before starting again. With more than one candidate,
// the last title of a round cannot immediately be the first title of the next.
export function nextShuffle(candidates:Subject[],round:ShuffleRound,random:()=>number=Math.random):ShuffleRound|undefined {
 const ids=[...new Set(candidates.map(subject=>subject.id))];if(!ids.length)return;
 const allowed=new Set(ids),seen=[...new Set(round.seen.filter(id=>allowed.has(id)))];
 let remaining=ids.filter(id=>!seen.includes(id)),nextSeen=seen;
 if(!remaining.length){nextSeen=[];remaining=ids.filter(id=>ids.length===1||id!==round.current);}
 const value=random(),unit=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
 const current=remaining[Math.min(remaining.length-1,Math.floor(unit*remaining.length))];
 return {current,seen:[...nextSeen,current]};
}
