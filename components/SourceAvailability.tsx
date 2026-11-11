'use client';
import {rankSources,sourcePerformanceLabel,type SourceHealth} from '../lib/source-health';
import {rememberBacklogAvailability} from '../lib/collection-backlog';
import {searchNames,type SubjectAliases} from '../lib/subject-aliases';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {availabilityLabels,checkSource,checkSources,cachedAvailability,storeAvailability,invalidateAvailability,type SourceAvailability} from '../lib/source-availability';
import {ruleCompatibility} from '../lib/subscriptions';
import type {Rule} from '../lib/web-core';
import type {Subject} from '../lib/catalog';
const cache=new Map<string,SourceAvailability>();
const empty:SourceAvailability={state:'queued',message:'',results:[]};
export function useSourceAvailability(subject:Subject|null,rules:Rule[],aliases:SubjectAliases={},deferred=false,owner:string|null='anonymous'){
 const [checks,setChecks]=useState<Record<string,SourceAvailability>>({}),[checksScope,setChecksScope]=useState(''),[revision,setRevision]=useState(0);
 const names=subject?searchNames(subject,aliases):[];
 // Editing several aliases must not repeatedly cancel and restart 17 sources.
 // Existing checks stay visible; the next explicit refresh/open uses new names.
 const scope=JSON.stringify([owner,subject?.id,subject?.eps,subject?.platform,rules.filter(r=>r.enabled!==false).map(r=>r)]);
 const current=useRef(scope);current.current=scope;
 const refreshScope=useRef('');
 const scan=useRef<AbortController|null>(null);
 const reports=useRef({scope,versions:new Map<string,number>()});
 if(reports.current.scope!==scope)reports.current={scope,versions:new Map<string,number>()};
 const key=(rule:Rule)=>scope+'|'+JSON.stringify(names)+'|'+rule.name;
 useEffect(()=>{
  const controller=new AbortController();scan.current=controller;const force=refreshScope.current===scope;refreshScope.current='';setChecksScope(scope);if(!subject||subject.id===0||deferred){setChecks({});return;}
  const enabled=rules.filter(r=>r.enabled!==false),candidates=enabled.filter(r=>!ruleCompatibility(r));
  const initial=Object.fromEntries(enabled.map(rule=>{const unsupported=ruleCompatibility(rule);return [rule.name,unsupported?{...empty,state:'error' as const,message:unsupported}:cachedAvailability(cache,key(rule))||empty];}));setChecks(initial);rememberBacklogAvailability(subject.id,initial,owner,rules);
  const versions=new Map(reports.current.versions);
  void checkSources(candidates,controller.signal,async rule=>{
   if(initial[rule.name].state!=='queued')return;
   const version=versions.get(rule.name)||0;
   if((reports.current.versions.get(rule.name)||0)!==version)return;
   const update=(value:SourceAvailability)=>{if(!controller.signal.aborted)setChecks(old=>{if(controller.signal.aborted||current.current!==scope||(reports.current.versions.get(rule.name)||0)!==version)return old;if(value.checkedAt){storeAvailability(cache,key(rule),value);rememberBacklogAvailability(subject.id,{[rule.name]:value},owner,rules);}return {...old,[rule.name]:value};});};
   update({...empty,state:'checking'});
   try{const result=await checkSource(rule,names,controller.signal,undefined,force,subject);if(controller.signal.aborted)return;update(result);}
   catch(e){if(!controller.signal.aborted)update({...empty,state:'error',message:(e as Error).message});}
  });return()=>controller.abort();
 },[scope,revision,deferred]);
 const report=(rule:Rule,value:Partial<SourceAvailability>)=>{if(current.current!==scope)return;reports.current.versions.set(rule.name,(reports.current.versions.get(rule.name)||0)+1);setChecks(old=>{if(current.current!==scope)return old;const previous=old[rule.name]||empty;
  // Resume resolves the video and reloads chapters concurrently. A late manual
  // catalogue report may enrich the rows, but cannot erase a playback outcome.
  const keepOutcome=value.state==='found'&&(previous.state==='playing'||previous.state==='episode-error');
  const next={...previous,...value,...(keepOutcome?{state:previous.state,message:previous.message}:{}),checkedAt:Date.now()};storeAvailability(cache,key(rule),next);if(subject)rememberBacklogAvailability(subject.id,{[rule.name]:next},owner,rules);return {...old,[rule.name]:next};});};
 const stop=()=>{if(current.current!==scope)return;scan.current?.abort();setChecks(old=>current.current===scope?Object.fromEntries(Object.entries(old).map(([name,check])=>[name,['queued','checking'].includes(check.state)?{...check,state:'paused' as const,message:'后台检测已暂停，可选择此源手动搜索'}:check])):old);};
 return {checks:checksScope===scope?checks:{},stop,refresh:()=>{invalidateAvailability(cache,scope);refreshScope.current=scope;setRevision(n=>n+1);},report};
}
type Props={health?:SourceHealth;rules:Rule[];checks:Record<string,SourceAvailability>;selected:number;busy?:boolean;onRefresh:()=>void;onSelect:(index:number,check:SourceAvailability)=>void};
export default function SourceAvailabilityList(p:Props){
 const [onlyFound,setOnlyFound]=useState(false);
 const hasEpisodes=(check:SourceAvailability|undefined)=>check?.state==='found'||check?.state==='playing'||!!check?.roads?.some(road=>road.episodes.length>0);
 const enabled=p.rules.filter(rule=>rule.enabled!==false),found=enabled.filter(rule=>hasEpisodes(p.checks[rule.name])).length;
 const count=Object.values(p.checks).filter(c=>c.state==='checking'||c.state==='queued').length;
 return <section className="source-availability" aria-label="当前番剧资源检测"><div className="source-check-heading"><h3>各源资源</h3><button type="button" onClick={p.onRefresh} disabled={!!count} aria-label="重新检测资源"><RefreshCw size={13} className={count?'spin':''}/>{count?'检测中 '+count:'重新检测'}</button></div>
 <p className="source-check-note">按别名、中文名和原名粗检。“有分集”表示找到目录，播放成功后标为“已播放”。无需等待全部检测，点击待检测的源可立即手动搜索。</p>
 <p className="source-check-note">优先有分集的源，再按本机近 30 天播放成功率与起播耗时排序；仅记录实际播放尝试，隐身观看不记录。</p>
 <div className="source-check-filters"><button type="button" aria-pressed={!onlyFound} onClick={()=>setOnlyFound(false)}>全部 {enabled.length}</button><button type="button" aria-pressed={onlyFound} onClick={()=>setOnlyFound(true)}>有分集 {found}</button></div>{onlyFound&&!found&&<p className="source-check-note" role="status">{count?'仍在检测，找到分集后会显示在这里。':'暂无已找到分集的源，可查看全部并手动尝试别名。'}</p>}<div className="source-check-list">{rankSources(p.rules,p.health||{},p.checks).map(({rule,index,performance})=>{if(rule.enabled===false)return null;const check=p.checks[rule.name]||empty;if(onlyFound&&!hasEpisodes(check))return null;return <button type="button" key={rule.name} className={'source-check '+(index===p.selected?'selected ':'')+check.state} title={check.message} disabled={p.busy} onClick={()=>p.onSelect(index,check)} aria-label={rule.name+'：'+availabilityLabels[check.state]}><span className="source-check-name"><i aria-hidden="true"/>{rule.name}</span><span className="source-check-status">{availabilityLabels[check.state]}</span>{check.message&&<small>{check.message}</small>}<small>{sourcePerformanceLabel(performance)}</small></button>;})}</div></section>;
}
