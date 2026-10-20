'use client';
import {useEffect,useRef,useState} from 'react';
import {Copy,Download,MoreHorizontal,RefreshCw} from 'lucide-react';
import type {Subject} from '../lib/catalog';
export default function SubjectActions({subject}:{subject:Subject}){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[manual,setManual]=useState('');
 const controller=useRef<AbortController|undefined>(undefined),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);if(alive.current){setManual('');setStatus('标题已复制');}}catch{if(alive.current){setManual(text);setStatus('复制未获允许，可选择下方标题手动复制');}}};
 const save=async()=>{
  if(controller.current)return;const request=new AbortController();controller.current=request;const timer=setTimeout(()=>request.abort(new DOMException('封面下载超时，请重试','TimeoutError')),20000);setBusy(true);setStatus('正在准备封面…');
  try{
   const response=await fetch('/api/cover?id='+subject.id,{signal:request.signal});if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:unknown};throw Error(typeof data.error==='string'?data.error:'封面下载失败，请重试');}
   if(!response.headers.get('content-type')?.startsWith('image/'))throw Error('封面未返回图片，请重试');
   const blob=await response.blob();if(!alive.current||request.signal.aborted)return;
   const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg',name=(subject.name_cn||subject.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().slice(0,80)||String(subject.id);
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name+'-封面.'+ext;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('已开始下载封面');
  }catch(error){if(alive.current&&(!request.signal.aborted||request.signal.reason?.name==='TimeoutError'))setStatus(request.signal.reason?.name==='TimeoutError'?'封面下载超时，请重试':(error as Error).message||'封面下载失败，请重试');}
  finally{clearTimeout(timer);if(alive.current)setBusy(false);if(controller.current===request)controller.current=undefined;}
 };
 return <details className="subject-actions"><summary className="secondary" aria-label="番剧更多操作"><MoreHorizontal size={16}/>更多</summary><div className="subject-actions-menu" role="group" aria-label="番剧操作"><button type="button" onClick={()=>void copy(subject.name_cn||subject.name)}><Copy size={15}/>复制番剧标题</button>{subject.name_cn&&subject.name_cn!==subject.name&&<button type="button" onClick={()=>void copy(subject.name)}><Copy size={15}/>复制原名</button>}<button type="button" onClick={()=>void save()} disabled={busy}>{busy?<RefreshCw size={15} className="spin"/>:<Download size={15}/>}保存封面</button>{status&&<p role="status">{status}</p>}{manual&&<input aria-label="可手动复制的标题" value={manual} readOnly onFocus={e=>e.currentTarget.select()}/>}</div></details>;
}
