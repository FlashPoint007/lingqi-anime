type Media=Pick<HTMLVideoElement,'paused'|'ended'|'readyState'|'currentSrc'|'pause'|'play'|'addEventListener'|'removeEventListener'>;
const editors=new WeakMap<Media,Set<()=>void>>();
// An actual timer expiry permanently revokes the old editor pause. Merely
// checking the current timer state would allow cancel/reset to revive it.
export function revokeDanmakuEditPause(media:Media|undefined|null){
 if(media)editors.get(media)?.forEach(invalidate=>invalidate());
}
// Resume only a pause created by this editor. Source changes, manual play,
// closing the player and a sleep timer all revoke the ability to resume.
export function createDanmakuEditPause(media:Media|undefined|null,mayResume:()=>boolean){
 let owned=false,closed=false,source='';
 const invalidate=()=>{owned=false;};
 if(media){let owners=editors.get(media);if(!owners){owners=new Set();editors.set(media,owners);}owners.add(invalidate);}
 const events=['play','ended','emptied'] as const;for(const name of events)media?.addEventListener(name,invalidate);
 return {
  begin(){if(closed||!media||media.paused||media.ended||media.readyState<2)return;source=media.currentSrc;owned=true;media.pause();},
  finish(resume=true){const can=owned;owned=false;if(!resume||!can||closed||!media||!media.paused||media.ended||media.currentSrc!==source||!mayResume())return;void media.play().catch(()=>{});},
  destroy(){closed=true;owned=false;for(const name of events)media?.removeEventListener(name,invalidate);if(media){const owners=editors.get(media);owners?.delete(invalidate);if(!owners?.size)editors.delete(media);}},
 };
}
