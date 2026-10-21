'use client';
import {useMemo,useState} from 'react';
import {Search} from 'lucide-react';
import AnimeCover from './AnimeCover';
import {collectionStates,collectionState,type CollectionState} from '../lib/collection-state';
import type {Subject} from '../lib/catalog';
export default function CollectionLibrary({items,historyCount,onOpen,onState,disabled}:{items:Subject[];historyCount:number;onOpen:(s:Subject)=>void;onState:(s:Subject,state:CollectionState|'')=>void;disabled:boolean}){
 const [state,setState]=useState<CollectionState|''>(''),[query,setQuery]=useState(''),[sort,setSort]=useState('recent');
 const counts=Object.fromEntries(Object.keys(collectionStates).map(key=>[key,items.filter(s=>collectionState(s.collectionStatus)===key).length]));
 const visible=useMemo(()=>{const q=query.trim().toLocaleLowerCase();const list=items.filter(s=>(!state||collectionState(s.collectionStatus)===state)&&(!q||(s.name+' '+(s.name_cn||'')).toLocaleLowerCase().includes(q)));if(sort==='name')list.sort((a,b)=>(a.name_cn||a.name).localeCompare(b.name_cn||b.name,'zh-CN'));if(sort==='score')list.sort((a,b)=>(b.rating?.score||b.score||0)-(a.rating?.score||a.score||0));return list;},[items,state,query,sort]);
 return <section className="collection-library" aria-label="追番管理">
  <div className="library-stats"><div><b>{items.length}</b><span>收藏动画</span></div><div><b>{counts.watching}</b><span>正在追番</span></div><div><b>{counts.completed}</b><span>标记看过</span></div><div><b>{historyCount}</b><span>最近有观看记录</span></div></div>
  <div className="collection-tabs" aria-label="按追番状态筛选"><button aria-pressed={!state} onClick={()=>setState('')}>全部 {items.length}</button>{Object.entries(collectionStates).map(([key,label])=><button key={key} aria-pressed={state===key} onClick={()=>setState(key as CollectionState)}>{label} {counts[key]}</button>)}</div>
  <div className="collection-tools"><label><Search size={15}/><input aria-label="筛选我的追番" value={query} placeholder="查找收藏的动画" onChange={e=>setQuery(e.target.value)}/></label><select aria-label="追番排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">最近更新</option><option value="name">名称</option><option value="score">评分</option></select><span>{visible.length} 部</span></div>
  {visible.length?<div className="cards">{visible.map(s=><article className="card" key={s.id}><button className="poster" onClick={()=>onOpen(s)} aria-label={'查看 '+(s.name_cn||s.name)}><AnimeCover src={s.images?.large||s.images?.common} alt={s.name_cn||s.name} lazy/></button><button className="card-title" onClick={()=>onOpen(s)}>{s.name_cn||s.name}</button><p>{s.date||s.air_date||'日期未收录'}{s.eps?' · '+s.eps+' 集':''}</p><select className="collection-state-select" aria-label={(s.name_cn||s.name)+'的追番状态'} value={collectionState(s.collectionStatus)} disabled={disabled} onChange={e=>onState(s,e.target.value as CollectionState|'')}>{Object.entries(collectionStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="">移出追番</option></select></article>)}</div>:<div className="empty compact"><h3>{items.length?'没有符合条件的追番':'追番列表还是空的'}</h3><p>{items.length?'试试其他状态或更短的关键词。':'在番剧详情中选择想看、在看等状态，开始整理片单。'}</p></div>}
  <p className="footnote">追番状态随收藏一起保存；登录后同步到数据库。观看记录统计只覆盖最近保留的 100 部，不代表累计观看时长。</p>
 </section>;
}
