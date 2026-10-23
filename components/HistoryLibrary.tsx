'use client';
import {useEffect,useMemo,useState} from 'react';
import {History,Play,Search,X} from 'lucide-react';
import AnimeCover from './AnimeCover';
import EpisodeHistory from './EpisodeHistory';
import {episodeStats} from '../lib/episode-progress';
import {historyResults,historyGroups,type HistoryRange} from '../lib/history-query';
import type {WatchRecord} from '../lib/personal-data';
import type {SubjectAliases} from '../lib/subject-aliases';
export default function HistoryLibrary({items,aliases={},disabled,onResume,onEpisode,onRemove}:{items:WatchRecord[];aliases?:SubjectAliases;disabled:boolean;onResume:(record:WatchRecord)=>void;onEpisode:(record:WatchRecord,number:number)=>void;onRemove:(id:number)=>void}){
 const [query,setQuery]=useState(''),[range,setRange]=useState<HistoryRange>('all'),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const visible=useMemo(()=>historyResults(items,query,range,aliases,now),[items,query,range,aliases,now]),groups=useMemo(()=>historyGroups(visible,now),[visible,now]),stats=episodeStats(items);
 return <section className="history-library" aria-label="观看记录管理">
  <p className="history-stats">最近保留的 {items.length} 部作品 · {stats.watched} 集有进度 · {stats.completed} 集到达结尾</p>
  <div className="collection-tools history-tools"><label><Search size={15}/><input aria-label="筛选观看记录" value={query} maxLength={120} placeholder="标题、别名、视频源或集名" onChange={e=>setQuery(e.target.value)}/></label><select aria-label="观看时间范围" value={range} onChange={e=>setRange(e.target.value as HistoryRange)}><option value="all">全部时间</option><option value="today">今天</option><option value="week">最近 7 天</option><option value="month">最近 30 天</option></select><span role="status">{visible.length} 部</span>{(query||range!=='all')&&<button className="secondary" type="button" onClick={()=>{setQuery('');setRange('all');}}>清除筛选</button>}</div>
  {groups.length?groups.map(group=><section className="history-day" key={group.day} aria-label={group.label+'的观看记录'}><h3>{group.label}<small>{group.items.length} 部</small></h3><div className="history-list">{group.items.map(h=><article key={h.subject.id}><AnimeCover src={h.subject.images?.large||h.subject.images?.common} alt={h.subject.name_cn||h.subject.name} lazy/><div><h4>{h.subject.name_cn||h.subject.name}</h4><p>{h.episode} · {Math.floor(h.position/60)} 分 {Math.floor(h.position%60)} 秒{h.ruleName?' · '+h.ruleName:''}</p><small>{new Date(h.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'})}</small><EpisodeHistory record={h} disabled={disabled} onResume={number=>onEpisode(h,number)}/></div><button className="secondary history-resume" disabled={disabled} onClick={()=>onResume(h)}><Play size={14}/>继续播放</button><button className="icon-button history-remove" disabled={disabled} aria-label={'删除 '+(h.subject.name_cn||h.subject.name)+' 的观看记录'} onClick={()=>onRemove(h.subject.id)}><X size={17}/></button></article>)}</div></section>):<div className="empty"><History size={38}/><h3>{items.length?'没有符合条件的观看记录':'你的观看旅程，即将开始'}</h3><p>{items.length?'试试其他关键词或时间范围，原有记录仍保留。':'播放视频后，这里会记录上次的进度。'}</p></div>}
  <p className="footnote">日期与时间按北京时间显示，最近 7 / 30 天包含今天。最多保留最近 100 部作品，逐集记录随账号同步。</p>
 </section>;
}
