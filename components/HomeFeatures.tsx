'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,ChevronLeft,ChevronRight,Pause,Play,Plus,RefreshCw,Star} from 'lucide-react';
import AnimeCover from './AnimeCover';
import {currentSeason,seasonNames,scoreLabel,type Subject} from '../lib/catalog';
import {bangumiRating} from '../lib/bangumi-rating';
import {featureData,type FeatureData} from '../lib/home-feature';
import {readFeatureCache,saveFeatureCache,featureCacheFresh} from '../lib/home-feature-cache';
import {coverUrl} from '../lib/cover-url';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';

const title=(s:Subject)=>s.name_cn||s.name;
const artwork=(s:Subject)=>s.images?.large||s.images?.common;
export default function HomeFeatures({onOpen,onToggle,isSaved,active=true}:{onOpen:(s:Subject)=>void;onToggle:(s:Subject)=>void;isSaved:(id:number)=>boolean;active?:boolean}){
 const [season,setSeason]=useState(currentSeason),[result,setResult]=useState<FeatureData>(),[index,setIndex]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[hidden,setHidden]=useState(false),[reduced,setReduced]=useState(false),[motionAllowed,setMotionAllowed]=useState(false);
 const root=useRef<HTMLElement|null>(null),[inViewport,setInViewport]=useState(true);
 const now=currentSeason(),{year,quarter}=season;
 // Identity is checked during render too: old cards never acquire a new label.
 const items=result?.year===year&&result.quarter===quarter?result.data:[],subject=items[index]||items[0];
 const display=useRef({result,subjectId:subject?.id});display.current={result,subjectId:subject?.id};
 useLayoutEffect(()=>{
  let alive=true;const controller=new AbortController(),saved=readFeatureCache(year,quarter);
  const current=display.current.result,retained=current?.year===year&&current.quarter===quarter?current:undefined,initial=retained||saved;
  if(!retained){setIndex(0);setResult(initial);}setError('');setLoading(!initial);
  if(!revision&&featureCacheFresh(saved))return;
  requestJson('/api/catalog?mode=featured&year='+year+'&quarter='+quarter+(revision?'&refresh=1':''),{signal:anySignal([controller.signal,timeoutSignal(20000)])}).then(raw=>{
   if(!alive)return;const next=featureData(raw,year,quarter),visible=display.current,id=visible.result?.year===year&&visible.result.quarter===quarter?visible.subjectId:undefined;
   saveFeatureCache(next);setResult(next);setIndex(Math.max(0,next.data.findIndex(s=>s.id===id)));
  }).catch(reason=>{if(alive)setError((initial?'推荐更新失败，保留本季度缓存：':'季度热门暂时无法加载：')+(reason as Error).message);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[year,quarter,revision]);
 useEffect(()=>{
  const media=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):undefined,visibility=()=>setHidden(document.hidden),motion=()=>setReduced(media?.matches===true);
  visibility();motion();document.addEventListener('visibilitychange',visibility);
  if(typeof media?.addEventListener==='function')media.addEventListener('change',motion);else media?.addListener?.(motion);
  return()=>{document.removeEventListener('visibilitychange',visibility);if(typeof media?.removeEventListener==='function')media.removeEventListener('change',motion);else media?.removeListener?.(motion);};
 },[]);
 useEffect(()=>{
  if(!root.current||typeof IntersectionObserver!=='function')return;
  const observer=new IntersectionObserver(entries=>{if(entries[0])setInViewport(entries[0].isIntersecting);});observer.observe(root.current);return()=>observer.disconnect();
 },[]);
 const autoplay=!paused&&(!reduced||motionAllowed);
 useEffect(()=>{
  if(!autoplay||!active||!inViewport||hovered||focused||hidden||loading||items.length<2)return;
  const timer=setTimeout(()=>setIndex(i=>(i+1)%items.length),8000);return()=>clearTimeout(timer);
 },[autoplay,active,inViewport,hovered,focused,hidden,loading,items.length,index,year,quarter]);
 useEffect(()=>{
  if(items.length<2||hidden||!active||!inViewport)return;const src=coverUrl(artwork(items[(index+1)%items.length]),'hero');if(!src)return;
  const image=new Image();image.referrerPolicy='no-referrer';image.fetchPriority='low';image.src=src;
 },[result,index,hidden,active,inViewport]);
 const move=(step:number)=>setIndex(i=>(i+step+items.length)%items.length);
 const score=subject?bangumiRating(subject).score:undefined;
 function selectSeason(year:number,quarter:number){setSeason({year,quarter});setRevision(0);}
 return <section ref={root} className="season-feature" aria-label="季度热门推荐" aria-roledescription="轮播" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}>
  <div className="season-feature-heading"><div><span>SEASON PICK</span><h2>季度热门</h2><p>按首播月份划分季度 · Bangumi 收藏热度</p></div><div className="season-feature-select"><label>年份<select aria-label="推荐年份" value={year} onChange={e=>{const y=Number(e.target.value);selectSeason(y,Math.min(quarter,y===now.year?now.quarter:4));}}>{Array.from({length:now.year-1999},(_,i)=>now.year-i).map(y=><option key={y} value={y}>{y} 年</option>)}</select></label><label>季度<select aria-label="推荐季度" value={quarter} onChange={e=>selectSeason(year,Number(e.target.value))}>{seasonNames.map((name,i)=><option key={name} value={i+1} disabled={year===now.year&&i+1>now.quarter}>{name}</option>)}</select></label>{(year!==now.year||quarter!==now.quarter)&&<button onClick={()=>selectSeason(now.year,now.quarter)}>回到本季</button>}</div></div>
  {subject?<div className="hero seasonal-hero" role="group" aria-roledescription="幻灯片" aria-label={`${year} 年${seasonNames[quarter-1]}推荐 ${index+1} / ${items.length}：${title(subject)}`}>
   <div className="hero-content"><div className="hero-kicker"><span>PICK UP</span><small>{year} {seasonNames[quarter-1]} · 热门 {String(index+1).padStart(2,'0')}</small></div><p className="hero-original">{subject.name_cn&&subject.name_cn!==subject.name?subject.name:'SEASONAL ANIME'}</p><h3>{title(subject)}</h3><p className="hero-intro">{subject.summary?.trim()||'从这一季的热门作品里，找到下一部想追的故事。'}</p><div className="hero-meta">{subject.platform&&<span>{subject.platform}</span>}<span>{subject.date||subject.air_date} 首播</span>{!!subject.eps&&<span>{subject.eps} 集</span>}{!!score&&<span className="hero-score"><Star size={13} fill="currentColor"/>Bangumi {scoreLabel(score)}</span>}</div><div className="hero-actions"><button className="primary" onClick={()=>onOpen(subject)}><Play size={16} fill="currentColor"/> 查看番剧 <ArrowUpRight size={17}/></button><button className="hero-save" onClick={()=>onToggle(subject)}>{isSaved(subject.id)?<Check size={17}/>:<Plus size={17}/>} {isSaved(subject.id)?'已加入追番':'加入追番'}</button></div><div className="feature-rotation"><button aria-label="上一部推荐" onClick={()=>move(-1)} disabled={items.length<2}><ChevronLeft size={18}/></button><div className="feature-dots">{items.map((s,i)=><button key={s.id} aria-label={`查看推荐 ${i+1}：${title(s)}`} aria-pressed={i===index} onClick={()=>setIndex(i)}>{String(i+1).padStart(2,'0')}</button>)}</div><button aria-label="下一部推荐" onClick={()=>move(1)} disabled={items.length<2}><ChevronRight size={18}/></button>{items.length>1&&<button className="feature-autoplay" aria-label={autoplay?'暂停自动轮换':'开启自动轮换'} onClick={()=>{if(autoplay)setPaused(true);else{setPaused(false);setMotionAllowed(true);}}}>{autoplay?<Pause size={14}/>:<Play size={14}/>}<span>{autoplay?'8 秒轮换':'已暂停'}</span></button>}</div></div>
   <figure className="hero-visual"><div className="feature-backdrop" aria-hidden="true"><AnimeCover size="hero" src={artwork(subject)} alt=""/></div><AnimeCover size="hero" priority className="hero-art" src={artwork(subject)} alt={title(subject)+' 封面'}/><figcaption><a href={'https://bgm.tv/subject/'+subject.id} target="_blank" rel="noreferrer">封面与条目：Bangumi</a><span>热度排序与评分独立 · 已开播作品</span></figcaption></figure>
  </div>:<div className="feature-empty" role="status" aria-busy={loading}>{loading?<><RefreshCw className="spin" size={22}/><p>正在寻找 {year} 年{seasonNames[quarter-1]}的热门动画…</p></>:<><h3>{error?'季度热门暂不可用':'这个季度暂无已开播的推荐'}</h3><p>{error||'可以切换其他季度，动画目录仍可正常浏览。'}</p><button className="secondary" onClick={()=>setRevision(n=>n+1)}>重新加载推荐</button></>}</div>}
  {subject&&(error||result?.cacheStale)&&<p className="feature-cache-note" role="status">{error||'正在显示本季度缓存推荐，热门数据可能稍有延迟。'}<button onClick={()=>setRevision(n=>n+1)}>刷新推荐</button></p>}
 </section>;
}
