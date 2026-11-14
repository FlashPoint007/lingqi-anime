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
import './source-availability.css';
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
type Props={scope?:string;health?:SourceHealth;rules:Rule[];checks:Record<string,SourceAvailability>;selected:number;busy?:boolean;onRefresh:()=>void;onSelect:(index:number,check:SourceAvailability)=>void};
export default function SourceAvailabilityList(p:Props){
 const [view,setView]=useState({generation:0,onlyFound:false,revision:0});
 const hasEpisodes=(check:SourceAvailability|undefined)=>check?.state==='found'||check?.state==='playing'||!!check?.roads?.some(road=>road.episodes.length>0);
 const ranked=rankSources(p.rules,p.health||{},p.checks).filter(({rule})=>rule.enabled!==false),signature=JSON.stringify([p.scope,p.rules]),hasChecks=Object.keys(p.checks).length>0;
 const ordering=useRef({signature:'',hasChecks:false,generation:0,all:[] as string[],found:[] as string[]});
 // Parent scope also distinguishes rapid subject/account switches while both
 // check maps are still empty. The empty-map guard supports existing callers.
 // Reset before a stale button callback can act on the next scope.
 // Background results only update labels: they must not move a pointer target.
 if(ordering.current.signature!==signature||ordering.current.hasChecks&&!hasChecks)ordering.current={signature,hasChecks,generation:ordering.current.generation+1,all:ranked.map(row=>row.rule.name),found:[]};
 ordering.current.hasChecks=hasChecks;
 const generation=ordering.current.generation,onlyFound=view.generation===generation&&view.onlyFound;
 const foundNames=ranked.filter(({rule})=>hasEpisodes(p.checks[rule.name])).map(({rule})=>rule.name),foundSet=new Set(foundNames);
 ordering.current.found=ordering.current.found.filter(name=>foundSet.has(name));
 for(const name of foundNames)if(!ordering.current.found.includes(name))ordering.current.found.push(name);
 const latest=useRef({generation,p,ranked});latest.current={generation,p,ranked};
 const isCurrent=()=>latest.current.generation===generation;
 const select=(name:string)=>{const current=latest.current;if(current.generation!==generation||current.p.busy)return;const index=current.p.rules.findIndex(rule=>rule.name===name&&rule.enabled!==false);if(index>=0)current.p.onSelect(index,current.p.checks[name]||empty);};
 const filter=(value:boolean)=>{if(isCurrent())setView(old=>({...old,generation,onlyFound:value}));};
 const sort=()=>{const current=latest.current;if(current.generation!==generation||current.p.busy)return;ordering.current.all=current.ranked.map(row=>row.rule.name);ordering.current.found=current.ranked.filter(({rule})=>hasEpisodes(current.p.checks[rule.name])).map(row=>row.rule.name);setView(old=>({...old,revision:old.revision+1}));};
 const byName=new Map(ranked.map(row=>[row.rule.name,row])),rows=(onlyFound?ordering.current.found:ordering.current.all).flatMap(name=>{const row=byName.get(name);return row?[row]:[];});
 const enabled=ranked.length,found=foundNames.length,count=Object.values(p.checks).filter(c=>c.state==='checking'||c.state==='queued').length;
 return <section className="source-availability" aria-label="当前番剧资源检测"><div className="source-check-heading"><h3>各源资源</h3><button type="button" onClick={()=>{const current=latest.current;if(isCurrent()&&!current.p.busy&&!Object.values(current.p.checks).some(check=>check.state==='checking'||check.state==='queued'))current.p.onRefresh();}} disabled={!!count||p.busy} aria-label="重新检测资源"><RefreshCw size={13} className={count?'spin':''}/>{count?'检测中 '+count:'重新检测'}</button></div>
 <p className="source-check-note">按别名、中文名和原名粗检。“有分集”表示找到目录，播放成功后标为“已播放”。无需等待全部检测，点击待检测的源可立即手动搜索。</p>
 <p className="source-check-note">检测时保持位置，避免点错片源。可按最新结果排序：优先有分集，再按本机近 30 天成功率与起播耗时；隐身观看不记录。</p>
 <div className="source-check-filters"><button type="button" aria-pressed={!onlyFound} onClick={()=>filter(false)}>全部 {enabled}</button><button type="button" aria-pressed={onlyFound} onClick={()=>filter(true)}>有分集 {found}</button><button type="button" className="source-check-sort" disabled={p.busy||enabled<2} onClick={sort}>按最新结果排序</button></div>{onlyFound&&!found&&<p className="source-check-note" role="status">{count?'仍在检测，找到分集后会显示在这里。':'暂无已找到分集的源，可查看全部并手动尝试别名。'}</p>}<div className="source-check-list">{rows.map(({rule,index,performance})=>{const check=p.checks[rule.name]||empty;return <button type="button" key={rule.name} className={'source-check '+(index===p.selected?'selected ':'')+check.state} title={check.message} disabled={p.busy} onClick={()=>select(rule.name)} aria-label={rule.name+'：'+availabilityLabels[check.state]}><span className="source-check-name"><i aria-hidden="true"/>{rule.name}</span><span className="source-check-status">{availabilityLabels[check.state]}</span><small className="source-check-message" aria-hidden={!check.message}>{check.message||'\u00a0'}</small><small className="source-check-performance">{sourcePerformanceLabel(performance)}</small></button>;})}</div></section>;
}
