'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {modalKey} from '../lib/modal-focus';
import {requestJson,timeoutSignal,anySignal} from '../lib/request-client';
type Mode='login'|'register'|'forgot'|'verify';
const headings:Record<Mode,string>={login:'邮箱登录',register:'注册邮箱账号',forgot:'找回密码',verify:'验证邮箱'};
export default function EmailAccount({onClose,onSuccess,flush,verifyEmail}:{onClose:()=>void;onSuccess:()=>void;flush:()=>unknown;verifyEmail?:string}){
 const [mode,setMode]=useState<Mode>(verifyEmail?'verify':'login'),[email,setEmail]=useState(verifyEmail||''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [mailReady,setMailReady]=useState<boolean|null>(null),[configError,setConfigError]=useState(false),[configRevision,setConfigRevision]=useState(0),[cooldown,setCooldown]=useState(false);
 const dialog=useRef<HTMLElement>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,old=document.body.style.overflow;dialog.current?.querySelector<HTMLElement>('.close')?.focus();document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>modalKey(e,dialog.current,onClose);document.addEventListener('keydown',key);return()=>{request.current?.abort();document.removeEventListener('keydown',key);document.body.style.overflow=old;previous?.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();setConfigError(false);void requestJson('/api/auth',{signal:anySignal([controller.signal,timeoutSignal(10000)])}).then(data=>{if(!controller.signal.aborted)setMailReady(data.mailConfigured===true);}).catch(()=>{if(!controller.signal.aborted)setConfigError(true);});return()=>controller.abort();},[configRevision]);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),60000);return()=>clearTimeout(timer);},[cooldown]);
 const changeMode=(next:Mode)=>{if(busy)return;setMode(next);setError('');setMessage('');setPassword('');};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy||mode!=='login'&&(mailReady!==true||cooldown))return;
  setBusy(true);setError('');setMessage('');const controller=new AbortController();request.current=controller;
  try{
   if(mode==='login'){await flush();if(controller.signal.aborted)return;}
   const data=await requestJson('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode==='forgot'?'forgot-password':mode==='verify'?'request-verification':mode,email,...(mode==='login'?{password}:{})}),signal:anySignal([controller.signal,timeoutSignal(20000)])});
   if(controller.signal.aborted)return;setPassword('');
   if(mode==='login'){onSuccess();onClose();}else{setMessage(data.message||'请求已受理，请检查邮箱。');setCooldown(true);}
  }catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
 };
 const needsMail=mode!=='login';
 return <div className="modal-backdrop account-backdrop" onClick={onClose}><section ref={dialog} className="panel email-account" role="dialog" tabIndex={-1} aria-modal="true" aria-label="邮箱账号" onClick={e=>e.stopPropagation()}>
  <button className="close icon-button" aria-label="关闭账号窗口" onClick={onClose}><X/></button><h2>{headings[mode]}</h2>
  <p className="muted">{mode==='login'?'登录后同步追番与观看记录。全站规则无需登录即可使用。':mode==='register'?'先验证邮箱，再通过邮件中的链接设置密码并完成注册。':mode==='forgot'?'输入注册邮箱，获取有效期为 30 分钟的密码重置链接。':'验证当前账号的邮箱，不会改动追番和观看记录。'}</p>
  {needsMail&&mailReady===false&&<p className="notice" role="status">邮箱服务尚未就绪，此功能暂不可用。已有账号仍可正常登录。</p>}
  {needsMail&&mailReady===null&&!configError&&<p className="muted" role="status">正在检查邮箱服务…</p>}
  {needsMail&&configError&&<p className="notice error" role="alert">无法检查邮箱服务。<button type="button" onClick={()=>setConfigRevision(n=>n+1)}>重新检查</button></p>}
  <form onSubmit={submit}>
   <label>邮箱<input type="email" autoComplete="username" value={email} maxLength={254} required readOnly={mode==='verify'} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
   {mode==='login'&&<label>密码<input type="password" autoComplete="current-password" minLength={12} maxLength={128} value={password} required disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>}
   {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
   <button type="submit" className="primary" disabled={busy||needsMail&&(mailReady!==true||cooldown)}>{busy?'正在处理…':needsMail&&cooldown?'一分钟后可重新发送':mode==='login'?'登录':mode==='register'?'发送注册验证邮件':mode==='forgot'?'发送密码重置邮件':'发送邮箱验证邮件'}</button>
  </form>
  <div className="email-account-links">{mode==='login'?<><button type="button" className="text-button" disabled={busy} onClick={()=>changeMode('register')}>没有账号？邮箱注册</button><button type="button" className="text-button" disabled={busy} onClick={()=>changeMode('forgot')}>忘记密码？</button></>:<button type="button" className="text-button" disabled={busy} onClick={()=>changeMode('login')}>返回邮箱登录</button>}</div>
  <p className="footnote">密码需为 12 至 128 个字符。邮件链接仅可使用一次，请勿转发；未收到邮件时，请检查垃圾邮件。</p>
 </section></div>;
}
