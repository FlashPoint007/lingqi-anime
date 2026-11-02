import type {WatchRecord} from './personal-data';
import type {Subject} from './catalog';
import {collectionState} from './collection-state';
export function watchResume(record:WatchRecord){
 const position=Number.isFinite(record.position)?Math.max(0,record.position):0;
 const stored=record.number===undefined?undefined:record.progresses?.[String(record.number)];
 const duration=stored&&Number.isFinite(stored.duration)&&stored.duration>0?stored.duration:0;
 // Keep the same five-second end guard as the player. A historical completed
 // flag must not hide an episode the viewer is currently watching again.
 const finished=duration>0&&position>=Math.max(0,duration-5);
 return {position,duration,finished,ratio:duration?Math.min(1,position/duration):undefined};
}
export function continueWatching(history:WatchRecord[],collection:Subject[],limit=3){
 const excluded=new Set(collection.filter(s=>['completed','dropped'].includes(collectionState(s.collectionStatus))).map(s=>s.id));
 const seen=new Set<number>();
 return [...history].sort((a,b)=>b.time-a.time).filter(record=>{if(record.subject.id<=0||seen.has(record.subject.id))return false;seen.add(record.subject.id);const state=watchResume(record);return !excluded.has(record.subject.id)&&state.position>0&&!state.finished;}).slice(0,Math.max(0,Math.min(6,limit)));
}
