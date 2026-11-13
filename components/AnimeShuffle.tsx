'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Shuffle} from 'lucide-react';
import AnimeCover from './AnimeCover';
import type {Subject} from '../lib/catalog';
import {nextShuffle,shuffleCandidates,type ShufflePool,type ShuffleRound} from '../lib/anime-shuffle';
import './anime-shuffle.css';

type Props={items:Subject[];collection:Subject[];ready:boolean;disabled?:boolean;scope:string;currentPoolLabel?:string;onOpen:(subject:Subject)=>void};
type Selection=ShuffleRound&{key:string};
export default function AnimeShuffle({items,collection,ready,disabled=false,scope,currentPoolLabel='当前已加载列表',onOpen}:Props){
 const [pool,setPool]=useState<ShufflePool>('list'),[selection,setSelection]=useState<Selection>({key:'',seen:[]});
 const list=useMemo(()=>shuffleCandidates(items,collection,'list'),[items,collection]),library=useMemo(()=>shuffleCandidates(items,collection,'collection'),[items,collection]),candidates=pool==='list'?list:library;
 const key=JSON.stringify([scope,ready,pool,candidates.map(subject=>subject.id)]),active=useRef({key,enabled:false});active.current={key,enabled:ready&&!disabled};
 // Scope includes the account and current filters. The key guard hides a stale
 // result during render, before effects run after a navigation or account switch.
 const selected=ready&&selection.key===key?candidates.find(subject=>subject.id===selection.current):undefined;
 useEffect(()=>{setSelection({key,seen:[]});},[key]);
 const choose=()=>{if(!active.current.enabled||active.current.key!==key)return;setSelection(previous=>{if(active.current.key!==key||!active.current.enabled)return previous;const next=nextShuffle(candidates,previous.key===key?previous:{seen:[]});return next?{...next,key}:{key,seen:[]};});};
 const open=()=>{if(selected&&active.current.enabled&&active.current.key===key)onOpen(selected);};
 const poolLabel=pool==='list'?currentPoolLabel:'我的追番 · 在看与想看';
 return <section className="anime-shuffle" aria-label="今晚看什么">
  <div className="anime-shuffle-heading"><div><span className="anime-shuffle-kicker"><Shuffle size={13} aria-hidden="true"/> 随心挑番</span><h2>今晚看什么</h2><p>选一部，留一点惊喜给今晚。</p></div><div className="anime-shuffle-pools" role="group" aria-label="随机挑番范围"><button type="button" aria-pressed={pool==='list'} disabled={!ready||disabled} onClick={()=>setPool('list')}>当前列表{ready?' · '+list.length:''}</button><button type="button" aria-pressed={pool==='collection'} disabled={!ready||disabled} onClick={()=>setPool('collection')}>我的追番{ready?' · '+library.length:''}</button></div></div>
  <div className="anime-shuffle-result" role="status" aria-live="polite" aria-atomic="true">{selected?<div className="anime-shuffle-picked"><AnimeCover src={selected.images?.common||selected.images?.large} alt={selected.name_cn||selected.name} lazy/><div><span className="anime-shuffle-result-label">这次遇见</span><h3>{selected.name_cn||selected.name}</h3>{selected.name_cn&&selected.name!==selected.name_cn&&<p className="anime-shuffle-original">{selected.name}</p>}<p>{selected.date||selected.air_date||'开播日期未收录'}{selected.eps?' · '+selected.eps+' 集':''}</p><button type="button" className="secondary" disabled={!ready||disabled} onClick={open}>查看详情 <ArrowRight size={13} aria-hidden="true"/></button></div></div>:<div className="anime-shuffle-empty"><p>{!ready?'正在读取你的追番状态…':disabled?'正在更新列表，稍后就能挑选':candidates.length?'不用纠结，从这份片单里挑一部。':pool==='collection'?'在看和想看的片单还是空的。':'当前列表没有可选番剧。'}</p><small>{ready&&!disabled&&!candidates.length?(pool==='collection'?'可切回当前列表，或在番剧详情中加入追番。':'可以换个筛选或翻页后再试。'):'点击下方按钮挑选，再查看详情和片源。'}</small></div>}</div>
  <div className="anime-shuffle-footer"><div><p>{poolLabel}{ready?' · '+candidates.length+' 部候选':''}</p><small>{pool==='list'?'只从当前已加载的列表中挑选，跳过标记看过和抛弃的番剧。':'只从你的在看与想看片单中挑选。'}{selected&&candidates.length===1?' 当前只有这一部。':''}</small></div><button type="button" className="primary" disabled={!ready||disabled||!candidates.length||!!selected&&candidates.length===1} onClick={choose}><Shuffle size={14} aria-hidden="true"/>{selected?'换一部':'帮我挑一部'}</button></div>
 </section>;
}
