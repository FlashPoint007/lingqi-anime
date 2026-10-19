'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,PanelRightClose,PanelRightOpen,Play,RefreshCw,Search,X} from 'lucide-react';
import Player from './Player';
import SourceAvailabilityList from './SourceAvailability';
import {availabilityLabels,type SourceAvailability} from '../lib/source-availability';
import type {Subject} from '../lib/catalog';
import type {Rule} from '../lib/web-core';
import {knownEpisodeNumber,episodeLabel,episodeNumber,episodeNeighbors,visibleEpisodes,playbackUrls,type Episode,type EpisodeTarget,type Road} from '../lib/playback-client';
type Playback={subject:Subject;episode:string;url:string;sourceUrl:string;source?:string;position:number;mediaUrl?:string;mediaType?:'hls'|'video';preferDirect?:boolean;number?:number;ruleName?:string};
type Props={dataSync?:ReactNode;player:Playback;mode:string;error:string;status:string;rules:Rule[];ruleIdx:number;query:string;busy:boolean;sourceError:string;results:{name:string;url:string}[];roads:Road[];road:number;episodes:{id:number;sort:number;name:string;name_cn?:string}[];checks:Record<string,SourceAvailability>;onCheckRefresh:()=>void;onCheckSelect:(index:number,check:SourceAvailability)=>void;onBack:()=>void;onRetry:()=>void;onCancel:()=>void;onReady:()=>void;onError:(s:string)=>void;onTime:(n:number,flush?:boolean)=>void;onRule:(n:number)=>void;onQuery:(s:string)=>void;onSearch:()=>void;onResult:(url:string)=>void;onRoad:(n:number)=>void;onPlay:(e:Episode)=>void;onAuto:(n:number)=>void};
export default function WatchPage(p:Props){
 const [panel,setPanel]=useState(true),[autoNext,setAutoNext]=useState(false),[episodeQuery,setEpisodeQuery]=useState(''),[descending,setDescending]=useState(false);
 useEffect(()=>setEpisodeQuery(''),[p.player.subject.id,p.ruleIdx]);
 useEffect(()=>{try{setAutoNext(localStorage.getItem('kw-auto-next')==='true');}catch{}},[]);
 const line=p.roads[p.road],index=line?.episodes.findIndex(e=>e.url===p.player.sourceUrl)??-1;
 const currentNumber=p.player.number??(index>=0?episodeNumber(line!.episodes[index],index):knownEpisodeNumber({name:p.player.episode}));
 const {previous,next}=episodeNeighbors(line?.episodes||[],p.player.sourceUrl,currentNumber,p.episodes.map(e=>e.sort),p.player.subject.eps);
 const visible=useMemo(()=>visibleEpisodes(line?.episodes||[],episodeQuery,descending),[line?.episodes,episodeQuery,descending]);
 const go=(target:EpisodeTarget|undefined)=>{if(target){if(target.episode)p.onPlay({...target.episode,number:target.number});else p.onAuto(target.number);}};
 const urls=playbackUrls(p.player);
 return <div className={'watch-page '+(!panel?'watch-theater':'')}>
  <header className="watch-header">
   <button className="watch-back" onClick={p.onBack}><ArrowLeft size={18}/><span>返回番剧</span></button>
   <div className="watch-title"><h1>{p.player.subject.name_cn||p.player.subject.name}</h1><p>{episodeLabel(p.player.episode,currentNumber)} · {p.mode==='resolving'?'正在寻找播放线路':p.mode==='video'?'本站播放':'当前线路'}</p></div>
   <button className="watch-next watch-previous" disabled={!previous||p.mode==='resolving'} onClick={()=>go(previous)}><ChevronLeft size={16}/><span>上一集</span></button>
   <button className="watch-next" disabled={!next||p.mode==='resolving'} onClick={()=>go(next)}>下一集 <ChevronRight size={16}/></button>
   <button className="watch-panel-toggle" aria-label={panel?'收起选集面板':'展开选集面板'} onClick={()=>setPanel(!panel)}>{panel?<PanelRightClose size={19}/>:<PanelRightOpen size={19}/>}</button>
  </header>
  <div className="watch-layout"><main className="watch-main" aria-label="站内播放器"><div className="watch-stage">
   {p.mode==='video'?<Player key={p.player.url} {...urls} mediaType={p.player.mediaType} castUrl={p.player.mediaUrl} position={p.player.position} onTime={p.onTime} onReady={p.onReady} onError={p.onError} onEnded={()=>{if(autoNext&&next)go(next);}}/>:<div className="playback-placeholder">
    {p.mode==='resolving'?<><RefreshCw className="spin" size={32}/><h2>正在准备播放器</h2><p role="status">{p.status||'正在寻找可播放的线路…'}</p><button className="secondary" onClick={p.onCancel}><X size={15}/>停止等待</button></>:<><Play size={36}/><h2>此线路暂不可播放</h2><p>可以重新尝试，或选择其他视频源。</p><div className="playback-recovery">
     {p.player.sourceUrl&&(!p.player.ruleName||p.rules[p.ruleIdx]?.name===p.player.ruleName)&&<button className="secondary" onClick={p.onRetry}><RefreshCw size={15}/>重新解析</button>}
     <button className="secondary" onClick={()=>p.onAuto(currentNumber??1)}><RefreshCw size={15}/>自动寻找其他源</button>
     <button className="secondary" onClick={()=>setPanel(true)}>选择其他视频源</button></div></>}
   </div>}
  </div>{p.error&&<div className="watch-error" role="alert" data-source-url={p.player.sourceUrl}>{p.error}</div>}</main>
  {panel&&<aside className="watch-sidebar" aria-label="选集与视频源">
   {p.dataSync}<div className="watch-section-heading"><h2>选集与线路</h2><span>{p.rules[p.ruleIdx]?.name||'选择视频源'}</span></div>
   <label className="watch-source-label">视频源<select aria-label="播放页视频源" value={p.ruleIdx} onChange={e=>p.onRule(Number(e.target.value))}>{p.ruleIdx<0&&<option value={-1}>请选择视频源</option>}{p.rules.map((r,i)=>r.enabled!==false&&<option key={r.name} value={i}>{r.name}{p.checks[r.name]?' · '+availabilityLabels[p.checks[r.name].state]:''}</option>)}</select></label>
   {p.player.subject.id!==0&&<SourceAvailabilityList rules={p.rules} checks={p.checks} selected={p.ruleIdx} busy={p.busy} onRefresh={p.onCheckRefresh} onSelect={p.onCheckSelect}/>}
   <div className="watch-preferences"><label><input type="checkbox" checked={autoNext} onChange={e=>{setAutoNext(e.target.checked);try{localStorage.setItem('kw-auto-next',String(e.target.checked));}catch{}}}/>自动播放下一集</label><span>空格暂停 · F 全屏</span></div>
   {p.sourceError&&<p className="watch-source-error" role="alert">{p.sourceError}</p>}<details className="watch-search" open={!line}><summary>搜索 / 更换番剧线路</summary><form onSubmit={e=>{e.preventDefault();p.onSearch();}}><input aria-label="播放页源站关键词" value={p.query} onChange={e=>p.onQuery(e.target.value)} placeholder="搜索当前番剧"/><button aria-label="搜索播放线路" disabled={p.busy||p.ruleIdx<0}>{p.busy?<RefreshCw className="spin" size={16}/>:<Search size={16}/>}</button></form><div className="watch-results">{p.results.map(r=><button key={r.url} disabled={p.busy} onClick={()=>p.onResult(r.url)}>{r.name}<ChevronRight size={14}/></button>)}</div></details>
   {p.roads.length>0&&<><div className="watch-roads" aria-label="播放线路">{p.roads.map((r,i)=><button key={i} className={p.road===i?'active':''} onClick={()=>p.onRoad(i)}>{r.name}</button>)}</div><div className="episode-tools"><input aria-label="筛选集数或标题" placeholder="输入集数或标题" value={episodeQuery} onChange={e=>setEpisodeQuery(e.target.value)}/><button type="button" aria-label="切换分集排序" aria-pressed={descending} onClick={()=>setDescending(!descending)}>{descending?'倒序':'正序'}</button><span>{visible.length} / {line?.episodes.length||0} 集</span></div><div className="watch-episodes">{visible.map(({episode:e,number,index:i})=><button key={e.url+'-'+i} disabled={p.busy} title={e.name} aria-label={'播放第 '+number+' 集 '+e.name} className={e.url===p.player.sourceUrl?'active':''} aria-current={e.url===p.player.sourceUrl?'true':undefined} onClick={()=>p.onPlay({...e,number})}><span className="episode-number">第 {number} 集</span><span className="episode-name">{e.name}</span></button>)}</div>{!visible.length&&<p className="watch-hint">没有匹配的剧集。<button onClick={()=>setEpisodeQuery('')}>清空筛选</button></p>}</>}
   {!p.roads.length&&p.episodes.length>0&&<><p className="watch-hint">选择剧集，自动寻找可用的视频源。</p><div className="watch-episodes">{p.episodes.map(e=><button key={e.id} onClick={()=>p.onAuto(e.sort)}>第 {e.sort} 集</button>)}</div></>}
   {!p.roads.length&&!p.episodes.length&&<p className="watch-hint">搜索番剧并选择结果后，完整分集会显示在这里。</p>}
   <p className="watch-hint">切换线路会继续当前集的观看进度。搜索和选集均留在本站。</p>
  </aside>}</div>
 </div>;
}
