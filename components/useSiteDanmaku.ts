'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {siteDanmakuScope,parseSiteDanmakuPosts,type SiteDanmakuPost,type DanmakuSession} from '../lib/site-danmaku';
const emptyPosts:SiteDanmakuPost[]=[];
export function useSiteDanmaku(subjectId:number,number:number|undefined,media:RefObject<HTMLVideoElement|null>,enabled:boolean,session?:DanmakuSession){
 const key=subjectId+':'+number+':'+(session?.owner||'anonymous'),latest=useRef(session);latest.current=session;
 const [data,setData]=useState<{key:string;posts:SiteDanmakuPost[]}>({key:'',posts:[]}),[state,setState]=useState<{key:string;message:string}>({key:'',message:''});
 const runtime=useRef<{key:string;refresh:()=>void;add:(post:SiteDanmakuPost)=>void;remove:(id:string)=>void}|undefined>(undefined);
 useEffect(()=>{
  let scope:ReturnType<typeof siteDanmakuScope>;try{scope=siteDanmakuScope(subjectId,number);}catch{setState({key,message:'本站弹幕需从有明确集数的番剧进入'});return;}
  if(!enabled){setState({key,message:'本站弹幕显示已关闭'});return;}
  let alive=true,busy=false,again=false,authRefresh=false,timer:ReturnType<typeof setTimeout>|undefined,request:AbortController|undefined;
  const additions=new Map<string,SiteDanmakuPost>(),removed=new Set<string>(),video=media.current;
  const message=(text:string)=>{if(alive)setState({key,message:text});};
  const merged=(posts:SiteDanmakuPost[])=>{
   const at=video?.currentTime||0,all=new Map(posts.map(post=>[post.id,post]));
   for(const [id,post] of additions){if(all.has(id)||Date.now()-post.createdAt>120000)additions.delete(id);else all.set(id,post);}
   return [...all.values()].filter(post=>!removed.has(post.id)&&post.time>=Math.max(0,at-12)&&post.time<=at+48).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)).slice(0,500);
  };
  const load=async()=>{
   clearTimeout(timer);if(!alive||document.hidden)return;if(busy){again=true;return;}busy=true;request=new AbortController();const current=request;
   try{
    const time=Number.isFinite(video?.currentTime)?Math.max(0,Math.min(86400,video!.currentTime)):0;
    const result=await requestJson('/api/site-danmaku?'+new URLSearchParams({subject:String(scope.subjectId),episode:scope.episode,time:String(time)}),{cache:'no-store',signal:anySignal([current.signal,timeoutSignal(12000)])});
    if(!alive||current.signal.aborted)return;
    if(result.accountId!==(latest.current?.emailAccount?latest.current.owner:null)){if(!authRefresh){authRefresh=true;latest.current?.refresh();}throw Error('登录状态已变化，请稍候或重新登录');}
    const posts=merged(parseSiteDanmakuPosts(result.posts));setData({key,posts});message(result.truncated?'附近弹幕较密集，显示最接近当前进度的 500 条':'本站弹幕 · 当前进度附近 '+posts.length+' 条');
   }catch(error){if(alive&&!current.signal.aborted)message((error as Error).message||'本站弹幕暂未更新');}
   finally{busy=false;if(alive&&!document.hidden){if(again){again=false;void load();}else timer=setTimeout(()=>void load(),video&&!video.paused?5000:15000);}}
  };
  const refresh=()=>{if(!alive)return;clearTimeout(timer);if(busy){again=true;request?.abort();}else void load();};
  const instance={key,refresh,add(post:SiteDanmakuPost){if(!alive)return;additions.set(post.id,post);setData(old=>({key,posts:merged(old.key===key?old.posts:[])}));},remove(id:string){if(!alive)return;removed.add(id);additions.delete(id);setData(old=>({key,posts:old.key===key?old.posts.filter(post=>post.id!==id):[]}));}};runtime.current=instance;
  const visibility=()=>{if(document.hidden){clearTimeout(timer);request?.abort();}else refresh();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',refresh);for(const event of ['seeked','play','loadedmetadata'])video?.addEventListener(event,refresh);
  message('正在读取本站弹幕…');void load();
  return()=>{alive=false;clearTimeout(timer);request?.abort();if(runtime.current===instance)runtime.current=undefined;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',refresh);for(const event of ['seeked','play','loadedmetadata'])video?.removeEventListener(event,refresh);};
 },[key,enabled]);
 return {posts:data.key===key?data.posts:emptyPosts,status:state.key===key?state.message:'正在读取本站弹幕…',refresh:()=>{if(runtime.current?.key===key)runtime.current.refresh();},add:(post:SiteDanmakuPost)=>{if(runtime.current?.key===key)runtime.current.add(post);},remove:(id:string)=>{if(runtime.current?.key===key)runtime.current.remove(id);}};
}
