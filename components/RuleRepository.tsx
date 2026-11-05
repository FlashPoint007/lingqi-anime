'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {normalizeRuleRepository,OFFICIAL_RULE_ROOT,REPOSITORY_STORAGE_KEY,repositoryRuleState,type RepositoryItem} from '../lib/rule-repository';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import type {Rule} from '../lib/web-core';

type Props={rules:Rule[];onInstall:(repository:string,file:string,rule:Rule)=>void};
export default function RuleRepository({rules,onInstall}:Props){
 const [input,setInput]=useState(''),[root,setRoot]=useState(''),[items,setItems]=useState<RepositoryItem[]>([]),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
 const request=useRef<AbortController|null>(null),generation=useRef(0),currentRules=useRef(rules);currentRules.current=rules;
 function cancel(){generation.current++;request.current?.abort();request.current=null;}
 useEffect(()=>{try{const value=localStorage.getItem(REPOSITORY_STORAGE_KEY);if(value)setInput(normalizeRuleRepository(value));}catch{}return cancel;},[]);
 function change(value:string){cancel();setInput(value);setRoot('');setItems([]);setBusy('');setError('');setStatus('');setQuery('');}
 async function load(){
  cancel();const ticket=generation.current;setError('');setStatus('');setRoot('');setItems([]);
  let repository:string;try{repository=normalizeRuleRepository(input);}catch(error){setError((error as Error).message);return;}
  const controller=new AbortController();request.current=controller;setBusy('catalog');
  try{
   const data=await requestJson('/api/rules?'+new URLSearchParams({repository}),{signal:anySignal([controller.signal,timeoutSignal(20000)])});
   if(ticket!==generation.current)return;
   if(data.repository!==repository||!Array.isArray(data.items))throw Error('仓库目录响应无效');
   setInput(repository);setRoot(repository);setItems(data.items);setStatus('已读取 '+data.items.length+' 条目录，可按需安装或更新');
   try{localStorage.setItem(REPOSITORY_STORAGE_KEY,repository);}catch{setStatus('目录已读取；浏览器未能保存仓库地址');}
  }catch(error){if(ticket===generation.current)setError((error as Error).message);}
  finally{if(ticket===generation.current){request.current=null;setBusy('');}}
 }
 async function install(item:RepositoryItem){
  const repository=root;if(!repository||busy)return;
  cancel();const ticket=generation.current,controller=new AbortController();request.current=controller;setBusy(item.file);setError('');setStatus('');
  try{
   const data=await requestJson('/api/rules?'+new URLSearchParams({repository,name:item.file}),{signal:anySignal([controller.signal,timeoutSignal(20000)])});
   if(ticket!==generation.current)return;
   if(data.repository!==repository||data.file!==item.file||data.rule?.name!==item.name)throw Error('规则与所选仓库不一致');
   if(repositoryRuleState(currentRules.current,repository,item)==='conflict')throw Error('已有同名规则，已保留原规则');
   onInstall(repository,item.file,data.rule);setStatus(item.name+' 已保存到本机规则');
  }catch(error){if(ticket===generation.current)setError((error as Error).message);}
  finally{if(ticket===generation.current){request.current=null;setBusy('');}}
 }
 const shown=items.filter(item=>item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className="panel repository-panel" aria-label="自定义规则仓库">
  <div className="section-heading"><h3>自定义规则仓库</h3><span className="count">本机</span></div>
  <p className="muted">支持 GitHub Raw 目录或 index.json 地址。读取后按需安装；全站官方规则继续自动同步。</p>
  <form className="repository-form" onSubmit={event=>{event.preventDefault();void load();}}>
   <label className="repository-address">仓库地址<input type="url" aria-label="规则仓库地址" value={input} placeholder={OFFICIAL_RULE_ROOT} onChange={event=>change(event.target.value)}/></label>
   <button type="submit" className="secondary" disabled={!!busy}><RefreshCw size={15} className={busy==='catalog'?'spin':''}/>{busy==='catalog'?'读取中…':'读取目录'}</button>
   <button type="button" onClick={()=>change(OFFICIAL_RULE_ROOT)}>使用官方地址</button>
  </form>
  {error&&<p role="alert" className="notice error">{error}</p>}{status&&<p role="status" className="repository-status">{status}</p>}
  {!!items.length&&<><label className="repository-search">筛选仓库规则<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="输入规则名称"/></label><div className="repository-items">{shown.map(item=>{
   const state=repositoryRuleState(rules,root,item);
   return <div className="repository-item" key={item.file}><div><b>{item.name}</b><small>{item.version?'v'+item.version:'未标版本'}{state==='conflict'?' · 已有同名规则，保留原规则':state==='installed'?' · 已从此仓库安装':''}</small></div><button type="button" className="secondary" disabled={!!busy||state==='conflict'} aria-label={(state==='conflict'?'已安装 ':state==='installed'?'更新规则 ':'安装规则 ')+item.name} onClick={()=>void install(item)}><Download size={14}/>{busy===item.file?'保存中…':state==='conflict'?'已安装':state==='installed'?'更新':'安装'}</button></div>;
  })}</div>{!shown.length&&<p className="empty compact">没有匹配的规则</p>}</>}
  <p className="footnote">仓库地址和安装结果保存在当前浏览器。更新仅替换同一仓库的同名本机规则，保留启用状态；不会覆盖全站订阅或其他本机规则。</p>
 </section>;
}
