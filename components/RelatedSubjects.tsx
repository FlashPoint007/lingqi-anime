'use client';
import {useEffect,useState} from 'react';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {type Subject,normalizeRelatedSubjects} from '../lib/catalog';
import AnimeCover from './AnimeCover';

export default function RelatedSubjects({id,onOpen}:{id:number;onOpen:(subject:Subject)=>void}){
 const [items,setItems]=useState<ReturnType<typeof normalizeRelatedSubjects>>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();setItems([]);setError('');setLoading(true);
  requestJson('/api/related?id='+id+(revision?'&refresh=1':''),{signal:anySignal([controller.signal,timeoutSignal(12000)])}).then(value=>{if(alive)setItems(normalizeRelatedSubjects(value.data,id));}).catch(reason=>{if(alive)setError(reason.message||'关联番剧暂不可用');}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[id,revision]);
 return <section className="related-subjects" aria-label="关联动画"><h3>关联动画 · 前传与续作</h3>{loading?<p className="muted" role="status">正在读取关联动画…</p>:error?<p className="muted" role="status">{error} <button type="button" onClick={()=>setRevision(n=>n+1)}>重试</button></p>:items.length?<div className="related-subject-list">{items.map(item=><button type="button" key={item.id} onClick={()=>onOpen(item)} aria-label={'查看关联动画 '+(item.name_cn||item.name)}><AnimeCover src={item.images?.common||item.images?.large} alt={item.name_cn||item.name}/><span><small>{item.relation}</small>{item.name_cn||item.name}</span></button>)}</div>:<p className="muted">暂未收录关联动画。</p>}</section>;
}
