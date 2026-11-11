'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Subject} from '../lib/catalog';
import type {WatchRecord} from '../lib/personal-data';
import type {Rule} from '../lib/web-core';
import {backlogSubjects,collectionBacklog,loadBacklogMetadata,readBacklogAvailability,type BacklogMetadata} from '../lib/collection-backlog';
import './collection-backlog.css';
type Entry={metadata?:BacklogMetadata;error?:string};
type Props={items:Subject[];history:WatchRecord[];owner:string;rules:Rule[];disabled:boolean;onOpen:(subject:Subject)=>void;onPlay?:(subject:Subject,number:number)=>void};
export default function CollectionBacklog({items,history,owner,rules,disabled,onOpen,onPlay}:Props){
 const subjects=useMemo(()=>backlogSubjects(items),[items]),signature=subjects.map(s=>s.id).join(','),scope=owner+'|'+signature;
 const [limit,setLimit]=useState(12),[entries,setEntries]=useState<Record<number,Entry>>({}),[entriesScope,setEntriesScope]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[expanded,setExpanded]=useState(false),[now,setNow]=useState(Date.now);
 const current=useRef(scope);current.current=scope;const refreshed=useRef(0);
 useEffect(()=>{const update=()=>setNow(Date.now()),timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 useEffect(()=>{
  const controller=new AbortController(),force=refreshed.current!==revision;refreshed.current=revision;let cursor=0;
  setEntriesScope(scope);setEntries({});setLoading(!disabled&&subjects.length>0);
  if(disabled)return()=>controller.abort();
  const ids=subjects.slice(0,limit).map(s=>s.id);
  const update=(id:number,entry:Entry)=>{if(!controller.signal.aborted&&current.current===scope)setEntries(old=>controller.signal.aborted||current.current!==scope?old:{...old,[id]:entry});};
  const worker=async()=>{while(cursor<ids.length&&!controller.signal.aborted){const id=ids[cursor++];try{update(id,{metadata:await loadBacklogMetadata(id,controller.signal,undefined,Date.now(),force)});}catch(error){if(!controller.signal.aborted)update(id,{error:error instanceof Error?error.message:'放送目录加载失败'});}}};
  void Promise.all([worker(),worker()]).finally(()=>{if(!controller.signal.aborted&&current.current===scope){setLoading(false);setNow(Date.now());}});
  return()=>controller.abort();
 },[scope,limit,revision,disabled]);
 const currentEntries=entriesScope===scope&&!disabled?entries:{},observedAt=Math.max(now,Date.now());
 const rows=subjects.slice(0,limit).map(subject=>{const entry=currentEntries[subject.id],record=history.find(h=>h.subject.id===subject.id);return {subject,entry,record,summary:entry?.metadata?collectionBacklog(entry.metadata,record,readBacklogAvailability(subject.id,owner,rules,observedAt,entry.metadata.data.map(e=>e.sort)),observedAt):undefined};}).sort((a,b)=>(b.summary?.pending||0)-(a.summary?.pending||0));
 const loaded=rows.filter(row=>row.summary),errors=rows.filter(row=>row.entry?.error).length,pending=loaded.reduce((n,row)=>n+row.summary!.pending,0),directory=loaded.reduce((n,row)=>n+row.summary!.directory,0),verified=loaded.reduce((n,row)=>n+row.summary!.verified,0),partial=loaded.length<subjects.length||loaded.some(row=>row.summary!.uncertain);
 if(!subjects.length)return null;
 return <section className="collection-backlog" aria-label="追番待看汇总" aria-busy={loading}>
  <div className="backlog-heading"><div><h3>接下来，看哪一集？</h3><p>在看与想看的正篇 · 按逐集观看记录整理</p></div><button type="button" className="secondary" disabled={loading||disabled} onClick={()=>setRevision(n=>n+1)}>更新汇总</button></div>
  <div className="backlog-stats" role="status"><div><strong>{loaded.length?(partial?'≥ ':'')+pending:'—'}</strong><span>已放送待看</span></div><div><strong>{directory}</strong><span>待看有目录</span></div><div><strong>{verified}</strong><span>待看已验证起播</span></div><p>{disabled?'正在读取个人空间':`已统计 ${loaded.length} / ${subjects.length} 部`}{loading?' · 正在读取放送日期':''}{errors?` · ${errors} 部加载失败`:''}{partial&&!loading?' · 部分数据待确认':''}</p></div>
  <div className="backlog-list">{(expanded?rows:rows.slice(0,6)).map(({subject,entry,record,summary})=><div className="backlog-item" key={subject.id}><div className="backlog-item-copy"><button type="button" className="backlog-title" onClick={()=>onOpen(subject)} disabled={disabled}>{subject.name_cn||subject.name}</button>{summary?<><p><b>{summary.pending?`${summary.uncertain?'至少 ':''}${summary.pending} 集待看`:summary.uncertain?'待看集数待确认':summary.aired===0?'尚未到放送日期':'已追平当前放送'}</b><span> · 已放送 {summary.aired} 集</span></p><small>{summary.directory?`待看有目录 ${summary.directory} 集`:(summary.checked?'尚未检出待看分集':'片源待检测')}{summary.verified?` · 近期起播验证 ${summary.verified} 集`:''}{entry?.metadata?.stale?' · 使用历史放送目录':''}{entry?.metadata?.data.length===0?' · 正篇目录未收录':''}{summary.unknownDates?` · ${summary.unknownDates} 集日期未收录`:''}{entry?.metadata&&!entry.metadata.complete?' · 长篇仅统计前 300 集内已收录目录':''}</small></>:<p className="backlog-pending">{disabled?'等待个人空间加载':entry?.error?`目录暂不可用：${entry.error}`:'正在读取放送目录…'}</p>}</div><div className="backlog-item-actions">{summary?.next!==undefined&&onPlay&&<button type="button" className="primary" disabled={disabled} onClick={()=>onPlay(subject,summary.next!)}>{record?.number===summary.next&&record.position>0?'续看':'观看'}第 {summary.next} 集</button>}<button type="button" className="secondary" disabled={disabled} onClick={()=>onOpen(subject)}>{summary?.checked?'查看片源':'检查片源'}</button></div></div>)}</div>
  <div className="backlog-more">{rows.length>6&&<button type="button" className="secondary" onClick={()=>setExpanded(value=>!value)}>{expanded?'收起待看列表':`展开本批 ${rows.length} 部`}</button>}{subjects.length>limit&&<button type="button" className="secondary" disabled={loading||disabled} onClick={()=>{setLimit(n=>n+12);setExpanded(true);}}>继续统计后 {Math.min(12,subjects.length-limit)} 部</button>}</div>
  <p className="footnote">放送按 Bangumi 的日期（含今天）统计；日期缺失或未加载时显示部分汇总。每批最多读取 12 部、并行 2 部。有目录不代表一定可播放，点击剧集时验证；片源检测与已播结果保留 10 分钟。已看仅依据当前保留的逐集记录，不按最高集号推算。</p>
 </section>;
}
