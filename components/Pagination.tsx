'use client';

import {useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {pageNumbers} from '../lib/catalog';

type Props={page:number;pages:number;total:number;disabled:boolean;onChange:(n:number)=>void};

export default function Pagination({page,pages,total,disabled,onChange}:Props){
 const [jump,setJump]=useState('');
 const numbers=pageNumbers(page,pages);

 return <nav className="pagination" aria-label="番剧分页">
  <span className="page-count">共 {total.toLocaleString()} 部 <span aria-hidden="true">·</span> 第 {page} / {pages} 页</span>
  <div className="page-buttons">
   <button type="button" disabled={disabled||page<=1} onClick={()=>onChange(page-1)} aria-label="上一页"><ChevronLeft size={16}/></button>
   {numbers.map((n,i)=><div className="page-item" key={n}>
    {i>0&&n-numbers[i-1]>1&&<span className="page-ellipsis" aria-hidden="true">…</span>}
    <button type="button" disabled={disabled} aria-label={`第 ${n} 页`} aria-current={page===n?'page':undefined} className={page===n?'selected':''} onClick={()=>onChange(n)}>{n}</button>
   </div>)}
   <button type="button" disabled={disabled||page>=pages} onClick={()=>onChange(page+1)} aria-label="下一页"><ChevronRight size={16}/></button>
  </div>
  <form onSubmit={e=>{e.preventDefault();const n=Number(jump);if(jump!==''&&Number.isInteger(n)&&n>=1&&n<=pages){onChange(n);setJump('');}}}>
   <label>跳至 <input type="number" aria-label="跳转页码" min={1} max={pages} value={jump} onChange={e=>setJump(e.target.value)} placeholder={String(page)}/></label>
   <button disabled={disabled||!jump}>跳转</button>
  </form>
 </nav>;
}
