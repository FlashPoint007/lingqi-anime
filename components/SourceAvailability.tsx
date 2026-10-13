'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {availabilityLabels,checkSource,checkSources,type SourceAvailability} from '../lib/source-availability';
import {ruleCompatibility} from '../lib/subscriptions';
import type {Rule} from '../lib/web-core';
import type {Subject} from '../lib/catalog';
const cache=new Map<string,SourceAvailability>();
const empty:SourceAvailability={state:'queued',message:'',results:[]};
export function useSourceAvailability(subject:Subject|null,rules:Rule[]){
 const [checks,setChecks]=useState<Record<string,SourceAvailability>>({}),[checksScope,setChecksScope]=useState(''),[revision,setRevision]=useState(0);
 const names=subject?[subject.name_cn||subject.name,subject.name].filter(Boolean):[];
 const scope=JSON.stringify([subject?.id,names,rules.filter(r=>r.enabled!==false).map(r=>r)]);
 const current=useRef(scope);current.current=scope;
 const key=(rule:Rule)=>scope+'|'+rule.name;
 useEffect(()=>{
  const controller=new AbortController();setChecksScope(scope);if(!subject||subject.id===0){setChecks({});return;}
  const candidates=rules.filter(r=>r.enabled!==false&&!ruleCompatibility(r));
  const initial=Object.fromEntries(candidates.map(rule=>{const saved=cache.get(key(rule));return [rule.name,!revision&&saved?.checkedAt&&Date.now()-saved.checkedAt<600000?saved:empty];}));setChecks(initial);
  void checkSources(candidates,controller.signal,async rule=>{
   if(initial[rule.name].state!=='queued')return;
   const started=Date.now();const update=(value:SourceAvailability)=>{if(!controller.signal.aborted)setChecks(old=>{if((old[rule.name]?.checkedAt||0)>started)return old;if(value.checkedAt){cache.set(key(rule),value);if(cache.size>160)cache.delete(cache.keys().next().value!);}return {...old,[rule.name]:value};});};
   update({...empty,state:'checking'});
   try{const result=await checkSource(rule,names,controller.signal);if(controller.signal.aborted)return;update(result);}
   catch(e){if(!controller.signal.aborted)update({...empty,state:'error',message:(e as Error).message});}
  });return()=>controller.abort();
 },[scope,revision]);
 const report=(rule:Rule,value:Partial<SourceAvailability>)=>{if(current.current!==scope)return;setChecks(old=>{const next={...(old[rule.name]||empty),...value,checkedAt:Date.now()};cache.set(key(rule),next);return {...old,[rule.name]:next};});};
 return {checks:checksScope===scope?checks:{},refresh:()=>setRevision(n=>n+1),report};
}
type Props={rules:Rule[];checks:Record<string,SourceAvailability>;selected:number;busy?:boolean;onRefresh:()=>void;onSelect:(index:number,check:SourceAvailability)=>void};
export default function SourceAvailabilityList(p:Props){
 const count=Object.values(p.checks).filter(c=>c.state==='checking'||c.state==='queued').length;
 return <section className="source-availability" aria-label="当前番剧资源检测"><div className="source-check-heading"><h3>各源资源</h3><button type="button" onClick={p.onRefresh} disabled={!!count} aria-label="重新检测资源"><RefreshCw size={13} className={count?'spin':''}/>{count?'检测中 '+count:'重新检测'}</button></div>
 <p className="source-check-note">按当前番剧的中文名和原名粗检。“有分集”表示找到目录，播放成功后标为“已播放”。</p>
 <div className="source-check-list">{p.rules.map((rule,index)=>{if(rule.enabled===false)return null;const check=p.checks[rule.name]||empty;return <button type="button" key={rule.name} className={'source-check '+(index===p.selected?'selected ':'')+check.state} title={check.message} disabled={p.busy||check.state==='queued'||check.state==='checking'} onClick={()=>p.onSelect(index,check)} aria-label={rule.name+'：'+availabilityLabels[check.state]}><span className="source-check-name"><i aria-hidden="true"/>{rule.name}</span><span className="source-check-status">{availabilityLabels[check.state]}</span>{check.message&&<small>{check.message}</small>}</button>;})}</div></section>;
}
