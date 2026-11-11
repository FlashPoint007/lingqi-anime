'use client';
import {useEffect,useRef,useState} from 'react';
import {readStorage,writeStorage} from '../lib/personal-data';
import {createSourceHealthTracker,type SourceHealth} from '../lib/source-health';
export function useSourceHealth(owner:string,ready:boolean,privatePlayback:boolean){
 const [saved,setSaved]=useState<{owner:string;data:SourceHealth}>({owner:'',data:{}});
 const tracker=useRef<ReturnType<typeof createSourceHealthTracker>|null>(null);
 if(!tracker.current)tracker.current=createSourceHealthTracker(readStorage,writeStorage,(owner,data)=>setSaved({owner,data}));
 tracker.current.context({owner,ready,private:privatePlayback});
 useEffect(()=>{
  if(!ready||privatePlayback)return;
  const refresh=()=>setSaved({owner,data:tracker.current!.load()});refresh();window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);
  return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh);};
 },[owner,ready,privatePlayback]);
 useEffect(()=>()=>tracker.current?.cancel(),[]);
 return {data:ready&&!privatePlayback&&saved.owner===owner?saved.data:{},...tracker.current};
}
