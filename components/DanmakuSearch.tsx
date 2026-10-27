'use client';
import {useEffect,useRef,useState} from 'react';
import {danmakuNames,type DanmakuMatch} from '../lib/danmaku';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {danmakuHistoryKey,cleanDanmakuHistory,rememberDanmakuSearch,danmakuKeyword} from '../lib/danmaku-search-history';

export default function DanmakuSearch({subjectId,owner,onChoose}:{subjectId:number;owner:string;onChoose:(match:DanmakuMatch)=>void}){
 const [keyword,setKeyword]=useState(''),[provider,setProvider]=useState(subjectId>0?'index':'bilibili'),[history,setHistory]=useState<string[]>([]),[privacy,setPrivacy]=useState(false),[results,setResults]=useState<DanmakuMatch[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|null>(null),scope=useRef('');scope.current=owner+':'+subjectId;
 const read=()=>{try{return cleanDanmakuHistory(JSON.parse(localStorage.getItem(danmakuHistoryKey)||'null'));}catch{return cleanDanmakuHistory(null);}};
 const privateMode=()=>{try{return JSON.parse(localStorage.getItem('kw-private-playback')||'false')===true;}catch{return true;}};
 useEffect(()=>{
  setKeyword('');setResults([]);setMessage('');setBusy(false);setProvider(subjectId>0?'index':'bilibili');
  const load=()=>{const hidden=privateMode();setPrivacy(hidden);setHistory(hidden?[]:read()[owner]?.find(item=>item.subject===subjectId)?.terms||[]);};load();
  const storage=(event:StorageEvent)=>{if(!event.key||[danmakuHistoryKey,'kw-private-playback'].includes(event.key))load();};window.addEventListener('storage',storage);window.addEventListener('lingqi-privacy',load);
  return()=>{request.current?.abort();request.current=null;window.removeEventListener('storage',storage);window.removeEventListener('lingqi-privacy',load);};
 },[subjectId,owner]);
 const search=async(raw:string)=>{
  const term=danmakuKeyword(raw);if(!term){setMessage('请输入番剧名称');return;}const context=scope.current;request.current?.abort();const controller=new AbortController();request.current=controller;setKeyword(term);setBusy(true);setResults([]);setMessage('正在检索弹幕番剧…');
  if(!privateMode()&&subjectId>0)try{const next=rememberDanmakuSearch(read(),owner,subjectId,term);localStorage.setItem(danmakuHistoryKey,JSON.stringify(next));setHistory(next[owner]?.find(item=>item.subject===subjectId)?.terms||[]);}catch{setMessage('检索中；浏览器暂不能保存历史');}
  try{
   const data=await requestJson('/api/danmaku?'+new URLSearchParams({op:'search',provider,keyword:term,id:String(subjectId)}),{signal:anySignal([controller.signal,timeoutSignal(35000)])});
   if(controller.signal.aborted||scope.current!==context)return;
   const list=Array.isArray(data.sources)?data.sources:[];setResults(list);setMessage((list.length?'找到 '+list.length+' 个条目，请核对季度后选择':'没有找到匹配条目')+(data.hasMore?'；结果较多，请缩短范围':'')+(data.notice?' · '+data.notice:''));
  }catch(error){if(!controller.signal.aborted&&scope.current===context)setMessage((error as Error).message||'检索失败，请稍后重试');}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 };
 const clear=()=>{try{const next=read();next[owner]=(next[owner]||[]).filter(item=>item.subject!==subjectId);localStorage.setItem(danmakuHistoryKey,JSON.stringify(next));setHistory([]);}catch{setMessage('历史清除失败，请检查浏览器存储设置');}};
 return <details className="danmaku-manual danmaku-search"><summary>按番剧检索弹幕</summary><label className="danmaku-field">检索来源<select aria-label="弹幕检索来源" value={provider} onChange={e=>{request.current?.abort();request.current=null;setBusy(false);setResults([]);setMessage('');setProvider(e.target.value);}}>{subjectId>0&&<option value="index">本番季度索引</option>}<option value="bilibili">BiliBili</option><option value="gamer">Gamer 巴哈姆特</option><option value="dandan">弹弹play</option></select></label>
  <form onSubmit={e=>{e.preventDefault();void search(keyword);}}><input aria-label="弹幕番剧关键词" maxLength={100} value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="输入番剧名或别名"/><button type="submit" disabled={busy||!keyword.trim()}>{busy?'检索中…':'检索'}</button>{busy&&<button type="button" onClick={()=>{request.current?.abort();request.current=null;setBusy(false);setMessage('已停止检索');}}>停止</button>}</form>
  {history.length>0&&<div className="danmaku-search-history" aria-label="本番剧弹幕检索历史"><span>本番最近检索</span>{history.map(term=><button key={term} type="button" onClick={()=>void search(term)}>{term}</button>)}<button type="button" onClick={clear}>清除本番历史</button></div>}
  <p className="danmaku-caption">{privacy?'隐身模式不读取或保存检索历史。':'每部番剧保留最近 5 条检索，仅存当前浏览器，并按账户区分。'}季度索引查找首播月份前后的公开来源；其他来源可检索更多作品。</p><p className="danmaku-caption" role="status">{message}</p>
  <div className="danmaku-search-results">{results.map(match=><button type="button" key={match.provider+':'+match.key} onClick={()=>onChoose(match)}><b>{match.title}</b><small>{danmakuNames[match.provider]} · 选择并加载完整分集</small></button>)}</div>
 </details>;
}
