'use client';
import {useEffect,useRef,useState} from 'react';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {danmakuSettings,defaultDanmakuSettings,exactDanmakuEpisode,parseDanmakuLink,importDanmaku,type DanmakuSettings,type DanmakuComment,type DanmakuMatch,type DanmakuEpisode,type DanmakuNotice} from '../lib/danmaku';
type CommentData={comments:DanmakuComment[];total:number;sampled:boolean};
const settingsKey='kw-danmaku-settings-v1';
export function useDanmaku(subjectId:number,number:number|undefined){
 const [settings,setSettings]=useState<DanmakuSettings>(defaultDanmakuSettings),[hydrated,setHydrated]=useState(false),[revision,setRevision]=useState(0);
 const [matches,setMatches]=useState<DanmakuMatch[]>([]),[notices,setNotices]=useState<DanmakuNotice[]>([]),[selected,setSelected]=useState(''),[matchStatus,setMatchStatus]=useState('');
 const [catalogue,setCatalogue]=useState<{key:string;title:string;episodes:DanmakuEpisode[];direct?:boolean}>(),[manualEpisode,setManualEpisode]=useState<{key:string;id:string}>(),[episodeStatus,setEpisodeStatus]=useState('');
 const [loaded,setLoaded]=useState<{key:string;data:CommentData}>(),[commentStatus,setCommentStatus]=useState(''),[loading,setLoading]=useState(false),[local,setLocal]=useState<CommentData>(),[fileStatus,setFileStatus]=useState('');
 const fileGeneration=useRef(0),mounted=useRef(true),manualMatches=useRef<DanmakuMatch[]>([]);
 useEffect(()=>{mounted.current=true;try{setSettings(danmakuSettings(JSON.parse(localStorage.getItem(settingsKey)||'null')));}catch{}setHydrated(true);return()=>{mounted.current=false;fileGeneration.current++;};},[]);
 useEffect(()=>{if(hydrated)try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}},[settings,hydrated]);
 useEffect(()=>{
  if(!hydrated||!settings.enabled||subjectId<=0)return;
  const controller=new AbortController();let live=true;setMatchStatus('正在匹配番剧弹幕…');
  requestJson('/api/danmaku?op=match&id='+subjectId+(revision?'&refresh=1':''),{signal:anySignal([controller.signal,timeoutSignal(35000)])}).then(data=>{
   if(!live)return;const sources:DanmakuMatch[]=Array.isArray(data.sources)?data.sources:[];setMatches([...sources,...manualMatches.current.filter(m=>!sources.some(s=>s.provider===m.provider&&s.key===m.key))]);setNotices(Array.isArray(data.notices)?data.notices:[]);
   setSelected(current=>current||[...sources].sort((a,b)=>(a.provider==='dandan'?-1:a.provider==='bilibili'?0:1)-(b.provider==='dandan'?-1:b.provider==='bilibili'?0:1)).map(m=>m.provider+':'+m.key)[0]||'');
   setMatchStatus(sources.length?'':'暂未匹配到弹幕，可以粘贴来源链接或导入文件');
  }).catch(error=>{if(live)setMatchStatus(error.message||'弹幕匹配失败，请重试');});
  return()=>{live=false;controller.abort();};
 },[subjectId,revision,hydrated,settings.enabled]);
 const source=matches.find(m=>m.provider+':'+m.key===selected),episodes=catalogue?.key===selected?catalogue.episodes:[];
 const autoEpisode=exactDanmakuEpisode(episodes,number),episode=manualEpisode?.key===selected?episodes.find(e=>e.id===manualEpisode.id):autoEpisode||(catalogue?.key===selected&&catalogue.direct&&episodes.length===1?episodes[0]:undefined);
 useEffect(()=>{
  if(!source||!settings.enabled||!hydrated||local)return;
  const controller=new AbortController();let live=true;setEpisodeStatus('正在读取弹幕分集…');
  requestJson('/api/danmaku?'+new URLSearchParams({op:'episodes',provider:source.provider,key:source.key,...(revision?{refresh:'1'}:{})}),{signal:anySignal([controller.signal,timeoutSignal(16000)])}).then(data=>{
   if(!live)return;setCatalogue({key:selected,title:data.title||source.title,episodes:Array.isArray(data.episodes)?data.episodes:[],direct:data.direct===true});setEpisodeStatus('');
  }).catch(error=>{if(live){setCatalogue(undefined);setEpisodeStatus(error.message||'弹幕分集读取失败');}});
  return()=>{live=false;controller.abort();};
 },[selected,source?.provider,source?.key,revision,settings.enabled,hydrated,!!local]);
 const episodeKey=source&&episode?source.provider+':'+episode.id:'';
 useEffect(()=>{
  if(!source||!episode||!settings.enabled||!hydrated||local){setLoading(false);return;}
  const controller=new AbortController();let live=true;setLoading(true);setCommentStatus('正在抓取弹幕…');
  requestJson('/api/danmaku?'+new URLSearchParams({op:'comments',provider:source.provider,key:episode.id,...(revision?{refresh:'1'}:{})}),{signal:anySignal([controller.signal,timeoutSignal(16000)])}).then(data=>{
   if(!live)return;
   if(!Array.isArray(data.comments))throw Error('弹幕数据格式不正确');setLoaded({key:episodeKey,data});setCommentStatus(data.comments.length?'':'这一集暂时没有弹幕');
  }).catch(error=>{if(live){setLoaded(undefined);setCommentStatus(error.message||'弹幕抓取失败，请重试');}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[episodeKey,selected,revision,settings.enabled,hydrated,!!local]);
 const data=local||(loaded?.key===episodeKey?loaded.data:undefined);
 const choose=(key:string)=>{fileGeneration.current++;setLocal(undefined);setFileStatus('');setSelected(key);setLoaded(undefined);setManualEpisode(undefined);setEpisodeStatus('');setCommentStatus('');};
 const manualMatch=(raw:string)=>{
  const target=parseDanmakuLink(raw);if(!target){setFileStatus('请粘贴 BiliBili 番剧链接（md / ss / ep），或 Gamer 动画链接');return false;}
  const match={...target,title:target.provider==='bilibili'?'手动匹配 · '+target.key:target.provider==='gamer'?'手动匹配 · Gamer':'手动匹配 · 弹弹play'};
  manualMatches.current=[...manualMatches.current.filter(m=>!(m.provider===target.provider&&m.key===target.key)),match].slice(-12);setMatches(current=>[...current.filter(m=>!(m.provider===target.provider&&m.key===target.key)),match].slice(-16));choose(target.provider+':'+target.key);setSettings(current=>({...current,enabled:true}));return true;
 };
 const importFile=async(file:File)=>{
  const generation=++fileGeneration.current;
  try{if(file.size>5*1024*1024)throw Error('请选择不超过 5 MB 的弹幕文件');const text=await file.text();if(!mounted.current||generation!==fileGeneration.current)return;
   const result=importDanmaku(text);if(!result.comments.length)throw Error('文件中没有可显示的弹幕');setLocal(result);setFileStatus('已导入 '+file.name.slice(0,100));setSettings(current=>({...current,enabled:true}));
  }catch(error){if(mounted.current&&generation===fileGeneration.current)setFileStatus(error instanceof Error?error.message:'弹幕文件读取失败');}
 };
 return {settings,setSettings,matches,notices,selected,choose,episodes,episode,chooseEpisode:(id:string)=>{fileGeneration.current++;setLocal(undefined);setFileStatus('');setManualEpisode({key:selected,id});setLoaded(undefined);setCommentStatus('');},title:catalogue?.key===selected?catalogue.title:source?.title,
  comments:data?.comments||[],total:data?.total||0,sampled:data?.sampled||false,loading,isLocal:!!local,importFile,clearImport:()=>{fileGeneration.current++;setLocal(undefined);setFileStatus('');},fileStatus,
  status:!settings.enabled?'弹幕已关闭':local?'本地弹幕已加载 · '+local.comments.length.toLocaleString()+' 条':!hydrated?'准备弹幕…':episodeStatus||(!source?(subjectId>0?matchStatus:'测试视频可手动匹配或导入弹幕'):!episode?'请选择与视频对应的弹幕分集':commentStatus),manualMatch,reload:()=>{setLoaded(undefined);setCatalogue(undefined);setEpisodeStatus('');setCommentStatus('');setRevision(n=>n+1);}};
}
