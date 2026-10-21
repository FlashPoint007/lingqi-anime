// Browser adaptation of Kazumi's interactive progress/serialized seek behavior.
export function playbackTime(seconds:number){
 if(!Number.isFinite(seconds)||seconds<0)return '--:--';
 const n=Math.floor(seconds),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;
 return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');
}
export function progressTime(x:number,left:number,width:number,duration:number){
 return width>0&&Number.isFinite(duration)&&duration>0?Math.max(0,Math.min(1,(x-left)/width))*duration:0;
}
// MP4 metadata may be at the end of the file. Receiving bytes is progress,
// even before loadeddata; retain a separate hard deadline against slow trickles.
export function createStartupGuard(onTimeout:()=>void){
 let closed=false,idle:ReturnType<typeof setTimeout>|undefined,hard:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{closed=true;clearTimeout(idle);clearTimeout(hard);};
 const expire=()=>{if(closed)return;stop();onTimeout();};
 const progress=()=>{if(closed)return;clearTimeout(idle);idle=setTimeout(expire,12000);};
 hard=setTimeout(expire,45000);progress();
 return {progress,stop};
}
type Media=Pick<HTMLMediaElement,'currentTime'|'duration'|'readyState'|'seeking'|'addEventListener'|'removeEventListener'>;
export function createSeekController(media:Media,onSettled:(time:number)=>void,onError:()=>void){
 let queued:number|undefined,active:number|undefined,desired:number|undefined,closed=false,timer:ReturnType<typeof setTimeout>|undefined;
 const finish=()=>{
  if(closed||active===undefined)return;
  clearTimeout(timer);timer=undefined;active=undefined;
  if(queued!==undefined){pump();return;}
  desired=undefined;try{onSettled(media.currentTime);}catch{onError();}
 };
 const pump=()=>{
  if(closed||active!==undefined||queued===undefined)return;
  const target=queued;queued=undefined;active=target;
  try{
   if(Math.abs(media.currentTime-target)<.05&&!media.seeking){finish();return;}
   // Some media engines omit seeked after a failed seek; never lock the controls.
   timer=setTimeout(finish,4000);
   media.currentTime=target;
  }catch{clearTimeout(timer);active=undefined;queued=undefined;desired=undefined;onError();}
 };
 const seek=(time:number)=>{
  if(closed||media.readyState<1||!Number.isFinite(time)||!Number.isFinite(media.duration)||media.duration<=0)return;
  desired=queued=Math.max(0,Math.min(media.duration,time));pump();return desired??media.currentTime;
 };
 media.addEventListener('seeked',finish);
 return {seek,by:(delta:number)=>seek((desired??media.currentTime)+delta),destroy(){closed=true;clearTimeout(timer);queued=active=desired=undefined;media.removeEventListener('seeked',finish);}};
}
