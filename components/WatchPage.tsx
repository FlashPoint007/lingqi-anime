'use client';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,PanelRightClose,PanelRightOpen,Play,RefreshCw,Search,X,ChevronDown,Radio,SlidersHorizontal} from 'lucide-react';
import Player from './Player';
import AnimeCover from './AnimeCover';
import {createPlaybackTimer} from '../lib/player-extras';
import SourceAvailabilityList from './SourceAvailability';
import {availabilityLabels,type SourceAvailability} from '../lib/source-availability';
import type {Subject} from '../lib/catalog';
import type {Rule} from '../lib/web-core';
import {knownEpisodeNumber,episodeLabel,episodeNumber,episodeNeighbors,visibleEpisodes,playbackUrls,type Episode,type EpisodeTarget,type Road} from '../lib/playback-client';
type Playback={subject:Subject;episode:string;url:string;sourceUrl:string;source?:string;position:number;mediaUrl?:string;mediaType?:'hls'|'video';preferDirect?:boolean;number?:number;ruleName?:string};
type Props={dataSync?:ReactNode;player:Playback;mode:string;error:string;status:string;rules:Rule[];ruleIdx:number;query:string;busy:boolean;sourceError:string;results:{name:string;url:string}[];roads:Road[];road:number;episodes:{id:number;sort:number;name:string;name_cn?:string}[];checks:Record<string,SourceAvailability>;onCheckRefresh:()=>void;onCheckSelect:(index:number,check:SourceAvailability)=>void;onBack:()=>void;onRetry:()=>void;onCancel:()=>void;onReady:()=>void;onError:(s:string)=>void;onTime:(n:number,flush?:boolean)=>void;onRule:(n:number)=>void;onQuery:(s:string)=>void;onSearch:()=>void;onStopSource:()=>void;onResult:(url:string)=>void;onRoad:(n:number)=>void;onPlay:(e:Episode)=>void;onAuto:(n:number)=>void};
export default function WatchPage(p:Props){
 const [panel,setPanel]=useState(true),[autoNext,setAutoNext]=useState(false),[episodeQuery,setEpisodeQuery]=useState(''),[descending,setDescending]=useState(false);
 useEffect(()=>setEpisodeQuery(''),[p.player.subject.id,p.ruleIdx]);
 useEffect(()=>{try{setAutoNext(localStorage.getItem('kw-auto-next')==='true');}catch{}},[]);
 const media=useRef<HTMLVideoElement>(null),sleep=useRef<ReturnType<typeof createPlaybackTimer>|null>(null);
 const [sleepChoice,setSleepChoice]=useState('off'),[remaining,setRemaining]=useState(0),[sleepExpired,setSleepExpired]=useState(false),[sleepMessage,setSleepMessage]=useState('');
 if(!sleep.current)sleep.current=createPlaybackTimer(()=>{media.current?.pause();setSleepChoice('off');setRemaining(0);setSleepExpired(true);setSleepMessage('定时时间已到，视频已暂停，自动连播已停止。');});
 useEffect(()=>{
  if(sleepChoice==='off'||sleepChoice==='episode')return;
  const tick=()=>{sleep.current!.mayPlay();setRemaining(sleep.current!.remaining);};tick();const interval=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',tick);};
 },[sleepChoice]);
 useEffect(()=>()=>{sleep.current?.cancel();},[]);
 const chooseSleep=(choice:string)=>{sleep.current!.set(choice==='episode'?'episode':Number(choice));setSleepChoice(choice);setSleepExpired(false);setSleepMessage('');setRemaining(sleep.current!.remaining);};
 const resumeSleep=()=>{sleep.current!.resume();setSleepExpired(false);setSleepMessage('');};
 const line=p.roads[p.road],index=line?.episodes.findIndex(e=>e.url===p.player.sourceUrl)??-1;
 const currentNumber=p.player.number??(index>=0?episodeNumber(line!.episodes[index],index):knownEpisodeNumber({name:p.player.episode}));
 const {previous,next}=episodeNeighbors(line?.episodes||[],p.player.sourceUrl,currentNumber,p.episodes.map(e=>e.sort),p.player.subject.eps);
 const visible=useMemo(()=>visibleEpisodes(line?.episodes||[],episodeQuery,descending),[line?.episodes,episodeQuery,descending]);
 const go=(target:EpisodeTarget|undefined)=>{if(target){if(target.episode)p.onPlay({...target.episode,number:target.number});else p.onAuto(target.number);}};
 const urls=playbackUrls(p.player);
 const episodeNames=useMemo(()=>new Map(p.episodes.map(e=>[e.sort,e.name_cn||e.name])),[p.episodes]);
 const enabledRules=p.rules.filter(r=>r.enabled!==false);
 const foundCount=enabledRules.filter(r=>{const c=p.checks[r.name];return c?.state==='found'||c?.state==='playing'||c?.roads?.some(r=>r.episodes.length>0);}).length;
 const currentTitle=episodeNames.get(currentNumber??-1)||episodeLabel(p.player.episode,currentNumber);
 return <div className={'watch-page '+(!panel?'watch-theater':'')}>
  <header className="watch-header">
   <button className="watch-back" aria-label="返回番剧" title="返回番剧" onClick={p.onBack}><span className="watch-brand-mark" aria-hidden="true">07</span><span className="watch-brand-copy"><b>零柒番剧</b><small>放映室 / WATCH</small></span><ArrowLeft size={16}/></button>
   <div className="watch-title"><h1>{p.player.subject.name_cn||p.player.subject.name}</h1><p>{episodeLabel(p.player.episode,currentNumber)} · {p.mode==='resolving'?'正在寻找播放线路':p.mode==='video'?'本站播放':'当前线路'}</p></div>
   <div className="watch-header-actions">
    <button className="watch-next watch-previous" disabled={!previous||p.mode==='resolving'} onClick={()=>go(previous)}><ChevronLeft size={16}/><span>上一集</span></button>
    <button className="watch-next" disabled={!next||p.mode==='resolving'} onClick={()=>go(next)}>下一集 <ChevronRight size={16}/></button>
    <button className="watch-panel-toggle" aria-label={panel?'收起选集面板':'展开选集面板'} aria-expanded={panel} onClick={()=>setPanel(!panel)}>{panel?<PanelRightClose size={19}/>:<PanelRightOpen size={19}/>}</button>
   </div>
  </header>
  <div className="watch-layout">
   <main className="watch-main" aria-label="站内播放器">
    <div className="watch-stage">
     {p.mode==='video'?<Player mediaRef={media} mayPlay={()=>sleep.current!.mayPlay()} playbackBlocked={sleepExpired} onPlayIntent={resumeSleep} key={p.player.url} {...urls} mediaType={p.player.mediaType} castUrl={p.player.mediaUrl} subjectId={p.player.subject.id} episodeNumber={currentNumber} position={p.player.position} onTime={p.onTime} onReady={p.onReady} onError={p.onError} onEnded={()=>{if(sleep.current!.mayPlay(true)&&autoNext&&next)go(next);}}/>:<div className="playback-placeholder">
      <AnimeCover className="watch-loading-art" src={p.player.subject.images?.large||p.player.subject.images?.common} alt=""/>
      <div className="watch-preparing-copy">
       <span className="watch-loading-symbol" aria-hidden="true">07</span>
       {p.mode==='resolving'?<><h2><RefreshCw className="spin" size={18}/>正在准备播放器</h2><p role="status">{p.status||'正在寻找可播放的线路…'}</p><button className="secondary" onClick={p.onCancel}><X size={15}/>停止等待</button></>:<><h2><Play size={19}/>此线路暂不可播放</h2><p>可以重新尝试，或选择其他视频源。</p><div className="playback-recovery">
        {p.player.sourceUrl&&(!p.player.ruleName||p.rules[p.ruleIdx]?.name===p.player.ruleName)&&<button className="secondary" onClick={p.onRetry}><RefreshCw size={15}/>重新解析</button>}
        <button className="secondary" onClick={()=>p.onAuto(currentNumber??1)}><RefreshCw size={15}/>自动寻找其他源</button>
        <button className="secondary" onClick={()=>setPanel(true)}>选择其他视频源</button>
       </div></>}
      </div>
     </div>}
    </div>
    {p.error&&<div className="watch-error" role="alert" data-source-url={p.player.sourceUrl}>{p.error}</div>}
    <div className="watch-now">
     <span className="watch-episode-stamp">EP.<b>{currentNumber===undefined?'—':String(currentNumber).padStart(2,'0')}</b></span>
     <div><h2>{currentTitle}</h2><p>{p.player.subject.name_cn||p.player.subject.name}{p.player.ruleName?' / '+p.player.ruleName:''}</p></div>
     <span className="watch-keyboard">空格暂停 · F 全屏</span>
    </div>
   </main>
   {panel&&<aside className="watch-sidebar" aria-label="选集与视频源">
    <div className="watch-section-heading"><div><span className="watch-eyebrow">EPISODES / 选集</span><h2>选集与线路</h2></div><span className="watch-episode-total">{line?.episodes.length||p.episodes.length||'—'} 集</span></div>
    {p.sourceError&&<p className="watch-source-error" role="alert">{p.sourceError}</p>}
    <label className="watch-source-label">视频源<select aria-label="播放页视频源" value={p.ruleIdx} onChange={e=>p.onRule(Number(e.target.value))}>{p.ruleIdx<0&&<option value={-1}>请选择视频源</option>}{p.rules.map((r,i)=>r.enabled!==false&&<option key={r.name} value={i}>{r.name}{p.checks[r.name]?' · '+availabilityLabels[p.checks[r.name].state]:''}</option>)}</select></label>
    {p.roads.length>0&&<>
     <div className="watch-roads" aria-label="播放线路">{p.roads.map((r,i)=><button key={i} className={p.road===i?'active':''} aria-pressed={p.road===i} onClick={()=>p.onRoad(i)}>{r.name}</button>)}</div>
     <div className="episode-tools"><Search size={14} aria-hidden="true"/><input aria-label="筛选集数或标题" placeholder="找集数 / 标题" value={episodeQuery} onChange={e=>setEpisodeQuery(e.target.value)}/><button type="button" aria-label="切换分集排序" aria-pressed={descending} onClick={()=>setDescending(!descending)}>{descending?'倒序':'正序'}</button><span>{visible.length} / {line?.episodes.length||0}</span></div>
     <div className="watch-episodes">{visible.map(({episode:e,number,index:i})=><button key={e.url+'-'+i} disabled={p.busy} title={e.name} aria-label={'播放第 '+number+' 集 '+e.name} className={e.url===p.player.sourceUrl?'active':''} aria-current={e.url===p.player.sourceUrl?'true':undefined} onClick={()=>p.onPlay({...e,number})}><span className="episode-number">{String(number).padStart(2,'0')}</span><span className="episode-name">{episodeNames.get(number)||(knownEpisodeNumber(e)!==undefined?'第 '+number+' 集':e.name)}</span></button>)}</div>
     {!visible.length&&<p className="watch-hint">没有匹配的剧集。<button onClick={()=>setEpisodeQuery('')}>清空筛选</button></p>}
    </>}
    {!p.roads.length&&p.episodes.length>0&&<><p className="watch-hint">选择剧集，自动寻找可用的视频源。</p><div className="watch-episodes">{p.episodes.map(e=><button key={e.id} aria-label={'自动寻找第 '+e.sort+' 集'} onClick={()=>p.onAuto(e.sort)}><span className="episode-number">{String(e.sort).padStart(2,'0')}</span><span className="episode-name">{e.name_cn||e.name||'第 '+e.sort+' 集'}</span></button>)}</div></>}
    {!p.roads.length&&!p.episodes.length&&<p className="watch-hint">搜索番剧并选择结果后，完整分集会显示在这里。</p>}
    <div className="watch-preferences"><label><input type="checkbox" checked={autoNext} onChange={e=>{setAutoNext(e.target.checked);try{localStorage.setItem('kw-auto-next',String(e.target.checked));}catch{}}}/>自动播放下一集</label><span>切线保留进度</span></div>
    {p.player.subject.id!==0&&<details className="watch-disclosure watch-resources" open={p.mode==='unavailable'}><summary><span><Radio size={15}/>片源检测</span><span className="watch-disclosure-meta">{foundCount} 个源有分集<ChevronDown size={14}/></span></summary><SourceAvailabilityList rules={p.rules} checks={p.checks} selected={p.ruleIdx} busy={p.busy} onRefresh={p.onCheckRefresh} onSelect={p.onCheckSelect}/></details>}
    <details className="watch-search watch-disclosure" open={!line}><summary><span><Search size={15}/>搜索 / 更换番剧线路</span><ChevronDown size={14}/></summary><form onSubmit={e=>{e.preventDefault();if(!p.busy&&p.ruleIdx>=0)p.onSearch();}}><input aria-label="播放页源站关键词" maxLength={120} value={p.query} onChange={e=>p.onQuery(e.target.value)} placeholder="搜索当前番剧"/><button aria-label="搜索播放线路" disabled={p.busy||p.ruleIdx<0}>{p.busy?<RefreshCw className="spin" size={16}/>:<Search size={16}/>}</button>{p.busy&&<button type="button" onClick={p.onStopSource}>停止等待</button>}</form><div className="watch-results">{p.results.map(r=><button key={r.url} disabled={p.busy} onClick={()=>p.onResult(r.url)}>{r.name}<ChevronRight size={14}/></button>)}</div></details>
    <details className="watch-disclosure watch-preference-panel" open={sleepChoice!=='off'||sleepExpired}><summary><span><SlidersHorizontal size={15}/>观看设置与同步</span><span className="watch-disclosure-meta">{sleepChoice==='episode'?'本集后暂停':remaining>0?'定时中':''}<ChevronDown size={14}/></span></summary>
     <div className="watch-sleep"><label>定时暂停<select aria-label="定时暂停" value={sleepChoice} onChange={e=>chooseSleep(e.target.value)}><option value="off">关闭</option><option value="episode">本集结束后</option><option value="1">1 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></label><p role="status">{sleepMessage||(sleepChoice==='episode'?'本集结束后暂停，不再自动连播。':remaining>0?'剩余 '+Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0'):'定时仅在当前观看页生效，切换分集会保留倒计时。')}</p>{sleepExpired&&<button type="button" onClick={()=>chooseSleep('off')}>取消定时限制</button>}</div>
     {p.dataSync}
    </details>
    <p className="watch-footnote"><span aria-hidden="true">07</span>零柒番剧 / LINGQI ANIME</p>
   </aside>}
  </div>
 </div>;
}
