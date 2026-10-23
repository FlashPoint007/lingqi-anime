'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Send,X,RotateCw} from 'lucide-react';
import EmailAccount from './EmailAccount';
import {requestJson,anySignal,timeoutSignal} from '../lib/request-client';
import {playbackTime} from '../lib/player-controls';
import {createDanmakuEditPause} from '../lib/danmaku-edit-pause';
import {SITE_DANMAKU_LIMIT,siteDanmakuScope,siteDanmakuDraft,parseSiteDanmakuPosts,type SiteDanmakuPost,type DanmakuSession} from '../lib/site-danmaku';
type Props={media:RefObject<HTMLVideoElement|null>;subjectId:number;number:number|undefined;session?:DanmakuSession;pauseOnEdit:boolean;onPauseOnEdit:(value:boolean)=>void;mayResume:()=>boolean;onClose:()=>void;onSent:(post:SiteDanmakuPost)=>void;onRemoved:(id:string)=>void};
const colors=[['白色','#ffffff'],['樱粉','#e9b7c7'],['杏色','#e7c29e'],['浅黄','#e6d995'],['鼠尾草绿','#b8ccb3'],['雾蓝','#acc8da']] as const;
export default function DanmakuComposer(p:Props){
 const [body,setBody]=useState(''),[mode,setMode]=useState<1|4|5>(1),[color,setColor]=useState('#ffffff'),[time,setTime]=useState(String(Math.round((p.media.current?.currentTime||0)*10)/10)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[login,setLogin]=useState(false),[mediaReady,setMediaReady]=useState((p.media.current?.readyState||0)>=1);
 const [mine,setMine]=useState(false),[page,setPage]=useState(1),[own,setOwn]=useState<SiteDanmakuPost[]>([]),[total,setTotal]=useState(0),[ownLoading,setOwnLoading]=useState(false),[ownError,setOwnError]=useState(''),[revision,setRevision]=useState(0),[confirm,setConfirm]=useState('');
 const latest=useRef(p);latest.current=p;const alive=useRef(true),generation=useRef(0),inFlight=useRef(false),write=useRef<AbortController|undefined>(undefined),mutation=useRef<{key:string;id:string}|undefined>(undefined),composing=useRef(false),panel=useRef<HTMLElement>(null),input=useRef<HTMLInputElement>(null),pause=useRef<ReturnType<typeof createDanmakuEditPause>|undefined>(undefined);
 let scope:ReturnType<typeof siteDanmakuScope>|undefined;try{scope=siteDanmakuScope(p.subjectId,p.number);}catch{}
 const account=p.session?.emailAccount?p.session.owner:undefined,count=Array.from(body).length,numericTime=time.trim()?Number(time):NaN;
 const duration=p.media.current?.duration,maxTime=Number.isFinite(duration)&&duration!>0?Math.min(86400,duration!):86400;
 useEffect(()=>{
  alive.current=true;const video=p.media.current;pause.current=createDanmakuEditPause(video,()=>!document.hidden&&latest.current.mayResume());if(p.pauseOnEdit)pause.current.begin();
  const ready=()=>setMediaReady((video?.readyState||0)>=1);video?.addEventListener('loadedmetadata',ready);video?.addEventListener('emptied',ready);
  input.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'nearest',behavior:'smooth'});
  return()=>{alive.current=false;generation.current++;write.current?.abort();pause.current?.destroy();video?.removeEventListener('loadedmetadata',ready);video?.removeEventListener('emptied',ready);};
 },[]);
 useEffect(()=>{if(!p.pauseOnEdit)pause.current?.finish(false);},[p.pauseOnEdit]);
 useEffect(()=>{
  if(!mine||!account||!scope)return;let live=true;const request=new AbortController();setOwnLoading(true);setOwnError('');setOwn([]);
  requestJson('/api/site-danmaku?'+new URLSearchParams({subject:String(scope.subjectId),episode:scope.episode,mine:'1',page:String(page)}),{cache:'no-store',signal:anySignal([request.signal,timeoutSignal(12000)])}).then(data=>{
   if(!live)return;if(data.accountId!==account)throw Error('个人空间已切换，请刷新登录状态');const rows=parseSiteDanmakuPosts(data.posts);if(!Number.isSafeInteger(data.total)||data.total<0||rows.some(post=>!post.own))throw Error('我的弹幕数据格式不正确');setOwn(rows);setTotal(data.total);
  }).catch(error=>{if(live)setOwnError(error.message);}).finally(()=>{if(live)setOwnLoading(false);});
  return()=>{live=false;request.abort();};
 },[mine,account,p.subjectId,p.number,page,revision]);
 const close=()=>{if(inFlight.current)return;pause.current?.finish(true);p.onClose();};
 const send=async()=>{
  if(inFlight.current)return;if(!account){setLogin(true);return;}if(!scope||!mediaReady){setError('加载有效的番剧剧集后再发送弹幕');return;}
  let value:ReturnType<typeof siteDanmakuDraft>;try{value=siteDanmakuDraft({subjectId:p.subjectId,episode:p.number,body,time:numericTime,mode,color:parseInt(color.slice(1),16)});if(value.time>maxTime)throw Error('弹幕时间不能超过本集时长');}catch(error){setError((error as Error).message);return;}
  const key=JSON.stringify({...value,account}),current=generation.current,owner=p.session?.owner;if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};inFlight.current=true;setBusy(true);setError('');const request=new AbortController();write.current=request;
  try{
   const result=await requestJson('/api/site-danmaku',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,accountId:account,mutationId:mutation.current.id}),signal:anySignal([request.signal,timeoutSignal(12000)])});
   if(!alive.current||current!==generation.current||latest.current.session?.owner!==owner)return;const post=parseSiteDanmakuPosts([result.post])[0];if(!result.saved||!post.own)throw Error('弹幕保存结果不正确，请重试');mutation.current=undefined;setBody('');pause.current?.finish(true);p.onSent(post);
  }catch(error){if(alive.current&&current===generation.current&&!request.signal.aborted){const message=(error as Error).message;setError(message);if(/登录|个人空间/.test(message))latest.current.session?.refresh();}}
  finally{inFlight.current=false;if(alive.current&&current===generation.current)setBusy(false);}
 };
 const remove=async(id:string)=>{
  if(inFlight.current||!account)return;inFlight.current=true;setBusy(true);setOwnError('');const request=new AbortController();write.current=request;const current=generation.current,owner=p.session?.owner;
  try{const result=await requestJson('/api/site-danmaku',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'delete',id,accountId:account,mutationId:crypto.randomUUID()}),signal:anySignal([request.signal,timeoutSignal(12000)])});if(!alive.current||current!==generation.current||latest.current.session?.owner!==owner)return;if(result.deleted!==true||result.id!==id)throw Error('撤回结果不正确，请重试');p.onRemoved(id);setConfirm('');if(own.length===1&&page>1)setPage(n=>n-1);else setRevision(n=>n+1);
  }catch(error){if(alive.current&&current===generation.current&&!request.signal.aborted){const message=(error as Error).message;setOwnError(message);if(/登录|个人空间/.test(message))latest.current.session?.refresh();}}finally{inFlight.current=false;if(alive.current&&current===generation.current)setBusy(false);}
 };
 const pausePreference=(value:boolean)=>{if(value)pause.current?.begin();else pause.current?.finish(true);p.onPauseOnEdit(value);};
 return <section ref={panel} className="danmaku-composer-panel" aria-label="本站弹幕编辑器" onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(login)setLogin(false);else close();}else if(!login)event.stopPropagation();}}>
  <header><div><span className="eyebrow">DANMAKU / 本站</span><h2>留下一条弹幕</h2></div><button type="button" className="icon-button" aria-label="关闭弹幕编辑器" disabled={busy} onClick={close}><X size={18}/></button></header>
  <p className="danmaku-composer-note">第 {p.number??'未知'} 集 · 发送后对访客公开，仅保存到本站。邮箱不会公开。</p>
  <form onSubmit={event=>{event.preventDefault();if(!composing.current)void send();}}>
   <label className="danmaku-composer-text">弹幕内容<input ref={input} aria-label="本站弹幕内容" value={body} maxLength={160} disabled={busy} onChange={event=>{setBody(event.target.value);setError('');}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.key==='Enter'&&(event.nativeEvent.isComposing||composing.current||event.nativeEvent.keyCode===229))event.preventDefault();}} placeholder="发一条友善的弹幕，见证当下" autoComplete="off"/><small className={count>SITE_DANMAKU_LIMIT?'over-limit':''}>{count} / {SITE_DANMAKU_LIMIT}</small></label>
   <div className="danmaku-composer-options"><label>位置<select aria-label="本站弹幕位置" value={mode} disabled={busy} onChange={event=>setMode(Number(event.target.value) as 1|4|5)}><option value={1}>滚动</option><option value={5}>顶部</option><option value={4}>底部</option></select></label><label>发送时间（秒）<input aria-label="本站弹幕发送时间" type="number" min={0} max={maxTime} step=".1" value={time} required disabled={busy} onChange={event=>setTime(event.target.value)}/></label><button type="button" className="text-button" disabled={busy||!mediaReady} onClick={()=>setTime(String(Math.round((p.media.current?.currentTime||0)*10)/10))}><RotateCw size={13}/>当前进度</button></div>
   <fieldset disabled={busy} className="danmaku-composer-colors"><legend>颜色</legend>{colors.map(([name,value])=><button key={value} type="button" aria-label={name+'弹幕'} aria-pressed={color===value} title={name} style={{backgroundColor:value}} onClick={()=>setColor(value)}/>)}<label>自选<input type="color" aria-label="本站弹幕自选颜色" value={color} onChange={event=>setColor(event.target.value)}/></label></fieldset>
   <div className="danmaku-draft-preview" aria-label="弹幕预览"><span style={{color}}>{body.trim()||'你的弹幕会出现在这里'}</span><small>{({1:'滚动',4:'底部',5:'顶部'} as const)[mode]} · {playbackTime(numericTime)}</small></div>
   <div className="danmaku-composer-submit"><label><input type="checkbox" checked={p.pauseOnEdit} disabled={busy} onChange={event=>pausePreference(event.target.checked)}/>编辑时暂停播放</label><button type="submit" className="primary" disabled={busy||count>SITE_DANMAKU_LIMIT||!!account&&(!body.trim()||!scope||!mediaReady||!Number.isFinite(numericTime)||numericTime<0||numericTime>maxTime)}><Send size={15}/>{busy?'正在保存…':account?'发送本站弹幕':'邮箱登录后发送'}</button></div>
   {(!scope||!mediaReady)&&<p className="danmaku-composer-note">从番剧详情选择剧集，视频加载后即可发送。</p>}{!account&&<p className="danmaku-composer-note">可先预览文字和样式，登录本站邮箱账户后再发送。</p>}{error&&<p role="alert" className="notice error">{error}</p>}
  </form>
  <details className="danmaku-mine" onToggle={event=>setMine(event.currentTarget.open)}><summary>我在本集发送的弹幕</summary>{!account?<p>登录后可查看和撤回。</p>:<>{ownLoading&&<p role="status">正在读取我的弹幕…</p>}{ownError&&<p role="alert">{ownError} <button type="button" onClick={()=>setRevision(n=>n+1)}>重试</button></p>}<ol>{own.map(post=><li key={post.id}><span className="danmaku-own-time">{playbackTime(post.time)}</span><span>{post.body}</span>{confirm===post.id?<div><button type="button" disabled={busy} onClick={()=>void remove(post.id)}>确认撤回</button><button type="button" disabled={busy} onClick={()=>setConfirm('')}>取消</button></div>:<button type="button" aria-label={'撤回弹幕 '+post.body} disabled={busy} onClick={()=>setConfirm(post.id)}>撤回</button>}</li>)}</ol>{!ownLoading&&!own.length&&!ownError&&<p>这一集还没有你发送的弹幕。</p>}{total>20&&<div className="danmaku-own-pages"><button type="button" disabled={busy||ownLoading||page===1} onClick={()=>setPage(n=>n-1)}>上一页</button><span>{page} / {Math.max(1,Math.min(500,Math.ceil(total/20)))}</span><button type="button" disabled={busy||ownLoading||page>=Math.min(500,Math.ceil(total/20))} onClick={()=>setPage(n=>n+1)}>下一页</button></div>}</>}</details>
  {login&&<EmailAccount flush={p.session?.flush||(()=>{})} onSuccess={()=>p.session?.refresh()} onClose={()=>setLogin(false)}/>} 
 </section>;
}
