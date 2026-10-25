type Identity={subjectId:number;number?:number};
// Keep failures local to one anime/episode. A catalogue match is not proof of
// browser playback, and must never clear a failed episode's connection.
export function createPlaybackRecovery(now=Date.now){
 let scope='',retries=0,deadline=0,cancelled=false;
 const failed=new Set<string>(),media=new Set<string>(),identity=(target:Identity)=>target.subjectId+':'+target.number;
 const begin=(target:Identity,manual=false,clear=false)=>{
  const next=identity(target);
  if(next!==scope||clear){scope=next;failed.clear();media.clear();retries=0;deadline=0;}
  // The first catalogue lookup consumes the same window as automatic retries.
  // Otherwise a slow initial lookup gets a second full window after it fails.
  if(manual){cancelled=false;retries=0;deadline=now()+90000;}
 };
 return {
  begin,
  failed(rule:string,url:string){return failed.has(rule+'\0'+url);},
  failedMedia(url:string|undefined){return !!url&&media.has(url);},
  recordMedia(target:Identity,url:string|undefined){begin(target);if(!url)return;media.add(url);while(media.size>128)media.delete(media.values().next().value!);},
  record(target:Identity,rule:string,url:string){begin(target);if(!url)return;failed.add(rule+'\0'+url);while(failed.size>128)failed.delete(failed.values().next().value!);},
  claim(target:Identity){
   begin(target);
   if(cancelled||target.subjectId<=0||!Number.isFinite(target.number))return false;
   if(!deadline)deadline=now()+90000;
   if(retries>=3||now()>=deadline)return false;
   retries++;return true;
  },
  remaining(){return cancelled?0:deadline?Math.max(0,deadline-now()):90000;},
  confirmed(){retries=0;deadline=0;},
  cancel(){cancelled=true;},
 };
}
