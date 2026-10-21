'use client';
import {useEffect,useState} from 'react';
import {Users} from 'lucide-react';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {credits,type Credit} from '../lib/subject-people';
import AnimeCover from './AnimeCover';
export default function SubjectPeople({id}:{id:number}){
 const [open,setOpen]=useState(false),[data,setData]=useState<{characters:Credit[];staff:Credit[];partial:boolean}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!open)return;let alive=true;const controller=new AbortController();setLoading(true);setError('');requestJson('/api/people?id='+id+(revision?'&refresh=1':''),{signal:anySignal([controller.signal,timeoutSignal(28000)])}).then(value=>{if(!Array.isArray(value.characters)||!Array.isArray(value.staff))throw Error('人物资料格式不正确');if(alive)setData({characters:credits(value.characters),staff:credits(value.staff,'staff'),partial:value.partial===true});}).catch(e=>{if(alive)setError(e.message||'人物资料暂不可用');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[id,open,revision]);
 const list=(items:Credit[],kind:'character'|'person')=><div className="people-grid">{items.map(p=><article key={p.id}><a href={'https://bgm.tv/'+kind+'/'+p.id} target="_blank" rel="noreferrer"><AnimeCover src={p.image} alt={p.name} lazy/><span><b>{p.name}</b><small>{p.role}</small></span></a>{p.actors.length>0&&<p>CV：{p.actors.map((a,i)=><span key={a.id}>{i?' / ':''}<a href={'https://bgm.tv/person/'+a.id} target="_blank" rel="noreferrer">{a.name}</a></span>)}</p>}</article>)}</div>;
 return <details className="subject-people" onToggle={e=>setOpen(e.currentTarget.open)}><summary><Users size={16}/>角色与制作人员<span>展开查看</span></summary>{loading&&<p role="status" className="muted">正在加载人物资料…</p>}{error&&<p role="status" className="feature-error">{error} <button onClick={()=>setRevision(n=>n+1)}>重试</button></p>}{data&&<>{data.partial&&<p className="muted">部分资料未能加载，已显示取得的内容。<button onClick={()=>setRevision(n=>n+1)}>重试</button></p>}<h4>角色与声优</h4>{data.characters.length?list(data.characters,'character'):<p className="muted">暂未收录角色资料。</p>}<h4>制作人员</h4>{data.staff.length?list(data.staff,'person'):<p className="muted">暂未收录制作人员。</p>}<p className="footnote">资料来自 Bangumi，点击人物可查看其完整档案。</p></>}</details>;
}
