'use client';
import {useEffect,useRef,useState} from 'react';
import {Mail,ShieldCheck} from 'lucide-react';
import {parseEmailAction,type EmailAction} from '../../lib/email-action';
import {requestJson,timeoutSignal,anySignal} from '../../lib/request-client';
export default function EmailActionPage(){
 const [link,setLink]=useState<EmailAction|null|undefined>(undefined),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const request=useRef<AbortController|null>(null),loaded=useRef(false);
 useEffect(()=>{
  // StrictMode replays effects; keep the parsed link when the fragment is already removed.
  if(!loaded.current){loaded.current=true;setLink(parseEmailAction(window.location.hash)||null);window.history.replaceState(null,'',window.location.pathname);}
  document.documentElement.dataset.lingqiHydrated='1';window.dispatchEvent(new Event('lingqi:ready'));
  return()=>request.current?.abort();
 },[]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!link||busy||done)return;if(link.action!=='verify'&&password!==confirm){setError('两次输入的密码不一致');return;}
  setBusy(true);setError('');const controller=new AbortController();request.current=controller;
  try{const data=await requestJson('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:link.action==='register'?'complete-registration':link.action==='reset'?'reset-password':'verify-email',token:link.token,...(link.action!=='verify'?{password}:{})}),signal:anySignal([controller.signal,timeoutSignal(20000)])});if(controller.signal.aborted)return;setDone(true);setMessage(data.message);setLink(null);setPassword('');setConfirm('');}
  catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
 };
 const title=done?'已完成':link?.action==='register'?'验证邮箱并设置密码':link?.action==='reset'?'设置新密码':link?.action==='verify'?'确认验证邮箱':link===undefined?'正在读取邮件链接…':'邮件链接不可用';
 return <main className="email-action-page"><a className="email-action-brand" href="/">零柒番剧 <span>LINGQI ANIME</span></a><section className="panel email-account email-action-card" aria-labelledby="email-action-title">
  {done?<ShieldCheck size={32}/>:<Mail size={32}/>}<h1 id="email-action-title">{title}</h1>
  {done?<p className="notice" role="status">{message}</p>:link===null?<p className="muted">链接不完整或已从地址栏移除。请从最新的邮件重新打开；已过期时，可返回首页重新申请。</p>:link&&<><p className="muted">{link.action==='register'?'设置密码后即可完成邮箱验证与注册。':link.action==='reset'?'密码重置成功后，所有设备需要重新登录。':'请确认这是你本人发起的邮箱验证。此操作不会修改密码或个人记录。'}</p><form onSubmit={submit}>
   {link.action!=='verify'&&<><label>新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label><label>确认新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></label><p className="footnote">密码需为 12 至 128 个字符。请设置与其他网站不同的密码。</p></>}
   {error&&<p className="notice error" role="alert">{error} 可从最新邮件重新打开，或返回首页重新申请。</p>}
   <button type="submit" className="primary" disabled={busy}>{busy?'正在处理…':link.action==='register'?'验证并完成注册':link.action==='reset'?'重置密码':'确认验证邮箱'}</button>
  </form></>}
  <a className="secondary email-action-home" href="/">返回首页{done?'登录':''}</a>
 </section><p className="footnote">零柒番剧 · 邮箱账号安全</p></main>;
}
