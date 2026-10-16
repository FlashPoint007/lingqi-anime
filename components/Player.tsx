'use client';
import {useEffect,useRef,useState} from 'react';
import type Hls from 'hls.js';
import {Maximize2,Minimize2,PictureInPicture2,Settings2,RefreshCw,Play} from 'lucide-react';
import {createUpscaler} from '../lib/anime4k';
import {loadCast,castVideo} from '../lib/casting';
type Props={url:string;fallbackUrl?:string;mediaType?:'hls'|'video';castUrl?:string;onTime:(n:number,flush?:boolean)=>void;position:number;onError:(s:string)=>void;onEnded?:()=>void;onReady?:()=>void};
export default function Player({url,fallbackUrl,mediaType,castUrl,onTime,position,onError,onEnded,onReady}:Props){
 const [activeUrl,setActiveUrl]=useState(url);
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),currentPosition=useRef(position),callbacks=useRef({onTime,onError,onEnded,onReady}),failed=useRef(new Set<string>()),confirmed=useRef(false),restoring=useRef(position>0),toggleRef=useRef<()=>void>(()=>{});
 callbacks.current={onTime,onError,onEnded,onReady};
 const [quality,setQuality]=useState<'off'|'balanced'|'quality'>('off'),[cors,setCors]=useState(false),[enhanced,setEnhanced]=useState(false),[timeline,setTimeline]=useState(0),[status,setStatus]=useState(''),[speed,setSpeed]=useState(1),[subtitle,setSubtitle]=useState(''),[castReady,setCastReady]=useState(false),[cast,setCast]=useState<Awaited<ReturnType<typeof castVideo>>|null>(null),[fullscreen,setFullscreen]=useState(false),[pageFullscreen,setPageFullscreen]=useState(false),[loading,setLoading]=useState(true),[hasFrame,setHasFrame]=useState(false),[needsPlay,setNeedsPlay]=useState(false);
 const speedRef=useRef(speed),playRef=useRef<()=>void>(()=>{}),attempt=useRef(0),failureHandled=useRef(false),bufferTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),pauseAfterReload=useRef(false),subtitleRequest=useRef(0);speedRef.current=speed;
 const clearBuffer=()=>{clearTimeout(bufferTimer.current);bufferTimer.current=undefined;};
 const commit=()=>{const v=video.current;if(v&&!restoring.current&&v.readyState>=1&&Number.isFinite(v.currentTime))callbacks.current.onTime(v.currentTime,true);};
 const fail=(message:string)=>{
  if(failureHandled.current)return;failureHandled.current=true;clearBuffer();
  failed.current.add(activeUrl);
  if(fallbackUrl&&activeUrl!==fallbackUrl&&!failed.current.has(fallbackUrl)){setActiveUrl(fallbackUrl);setStatus('正在尝试备用视频连接…');}
  else callbacks.current.onError(message);
 };
 const play=()=>{const v=video.current;if(!v)return;pauseAfterReload.current=false;const generation=attempt.current;setNeedsPlay(false);void v.play().catch(e=>{if(generation!==attempt.current||failureHandled.current)return;if(e.name==='NotAllowedError'){setNeedsPlay(true);setStatus('点击播放继续观看');}else if(e.name!=='AbortError')fail('无法开始播放，请重试或更换线路');});};
 playRef.current=play;
 const buffering=()=>{setLoading(true);if(bufferTimer.current!==undefined)return;const generation=attempt.current;bufferTimer.current=setTimeout(()=>{bufferTimer.current=undefined;const v=video.current;if(generation===attempt.current&&v&&!v.paused&&!v.ended)fail('视频缓冲等待过久，请重试或更换视频源');},20000);};
 useEffect(()=>{
  const v=video.current!;let h:Hls|undefined,cancelled=false;attempt.current++;failureHandled.current=false;clearBuffer();confirmed.current=false;restoring.current=currentPosition.current>0;setLoading(true);setHasFrame(false);setNeedsPlay(false);
  const seek=()=>{restoring.current=currentPosition.current>0&&Number.isFinite(v.duration)&&currentPosition.current<v.duration;if(restoring.current)v.currentTime=currentPosition.current;v.playbackRate=speedRef.current;};
  const ready=()=>{clearTimeout(timer);setLoading(false);setHasFrame(true);if(!pauseAfterReload.current)play();};
  v.addEventListener('loadedmetadata',seek,{once:true});v.addEventListener('loadeddata',ready,{once:true});
  const timer=setTimeout(()=>{if(!cancelled&&v.readyState<2)fail('视频连接等待过久，请重试或更换视频源');},12000);
  if((mediaType==='hls'||/\.m3u8(?:[?#]|$)/i.test(activeUrl))&&!v.canPlayType('application/vnd.apple.mpegurl')){
   import('hls.js').then(({default:Hls})=>{if(cancelled)return;if(!Hls.isSupported()){fail('当前浏览器不支持 HLS');return;}h=new Hls();h.loadSource(activeUrl);h.attachMedia(v);h.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal&&!cancelled)fail('当前线路视频加载失败，请切换线路或视频源');});}).catch(()=>{if(!cancelled)fail('播放器加载失败，请重试');});
  }else v.src=activeUrl;
  return()=>{cancelled=true;attempt.current++;clearBuffer();clearTimeout(timer);if(!restoring.current&&v.readyState>=1)callbacks.current.onTime(v.currentTime,true);v.removeEventListener('loadedmetadata',seek);v.removeEventListener('loadeddata',ready);h?.destroy();v.pause();v.removeAttribute('src');v.load();};
 },[activeUrl,cors,mediaType]);
 useEffect(()=>{try{const n=Number(localStorage.getItem('kw-player-speed'));if(n>=0.5&&n<=2){setSpeed(n);video.current!.playbackRate=n;}}catch{}},[]);
 useEffect(()=>{const save=()=>{if(document.visibilityState==='hidden')commit();};document.addEventListener('visibilitychange',save);window.addEventListener('pagehide',commit);return()=>{document.removeEventListener('visibilitychange',save);window.removeEventListener('pagehide',commit);};},[]);
 useEffect(()=>{if(quality==='off')return;let cancelled=false,stop:(()=>void)|undefined;const v=video.current!;
  const start=async()=>{try{setStatus('正在初始化 Anime4K…');const release=await createUpscaler(v,canvas.current!,quality,message=>{if(!cancelled){setStatus(message);setEnhanced(false);setQuality('off');}},()=>{if(!cancelled){setEnhanced(true);setStatus('Anime4K 2× 超分已开启');}});if(cancelled)release();else stop=release;}catch(e){if(!cancelled){setStatus((e as Error).message);setQuality('off');setEnhanced(false);}}};
  if(v.readyState>=2)void start();else v.addEventListener('loadeddata',start,{once:true});
  return()=>{cancelled=true;v.removeEventListener('loadeddata',start);stop?.();setEnhanced(false);};
 },[quality,cors,activeUrl]);
 useEffect(()=>()=>{if(subtitle)URL.revokeObjectURL(subtitle);},[subtitle]);
 useEffect(()=>()=>{subtitleRequest.current++;},[]);
 useEffect(()=>{
  const container=stage.current!,v=video.current!;
  const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.closest('input,select,textarea,button,summary'))return;if(e.key.toLowerCase()==='f'){e.preventDefault();toggleRef.current();}else if(e.key===' '){e.preventDefault();v.paused?playRef.current():v.pause();}else if(['ArrowRight','ArrowLeft'].includes(e.key)&&Number.isFinite(v.duration)){e.preventDefault();v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+(e.key==='ArrowRight'?10:-10)));}};
  container.addEventListener('keydown',key);return()=>container.removeEventListener('keydown',key);
 },[]);
 useEffect(()=>{const sync=()=>setFullscreen(document.fullscreenElement===stage.current||document.fullscreenElement===video.current);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
 useEffect(()=>{if(!pageFullscreen)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';const exit=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setPageFullscreen(false);setStatus('');}};window.addEventListener('keydown',exit);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',exit);};},[pageFullscreen]);
 const run=async(fn:()=>Promise<unknown>|unknown)=>{try{await fn();}catch(e){setStatus((e as Error).message||'操作已取消或设备不可用');}};
 const remote=()=>{const v=video.current as any;if(v.webkitShowPlaybackTargetPicker)v.webkitShowPlaybackTargetPicker();else if(v.remote?.prompt)return v.remote.prompt();else throw new Error('此浏览器未提供 AirPlay / 远程播放，请使用 Google Cast');};
 const toggleFullscreen=async()=>{
  if(pageFullscreen){setPageFullscreen(false);setStatus('');return;}
  if(document.fullscreenElement){await run(()=>document.exitFullscreen());return;}
  try{if(stage.current?.requestFullscreen){await stage.current.requestFullscreen();setStatus('');return;}const v=video.current as HTMLVideoElement & {webkitEnterFullscreen?:()=>void};if(v.webkitEnterFullscreen){v.webkitEnterFullscreen();return;}}catch{}
  setPageFullscreen(true);setStatus('已进入网页全屏，按 Esc 退出');
 };
 toggleRef.current=()=>{void toggleFullscreen();};
 const pictureInPicture=()=>run(async()=>{if(enhanced){setQuality('off');setEnhanced(false);}if(!document.pictureInPictureEnabled||video.current!.readyState<2)throw new Error('视频加载完成后可开启画中画');await video.current!.requestPictureInPicture();setStatus('画中画显示原始视频');});
 const importSubtitle=async(event:React.ChangeEvent<HTMLInputElement>)=>{
  const input=event.currentTarget,file=input.files?.[0],generation=++subtitleRequest.current;if(!file)return;
  try{
   if(file.size>2097152)throw new Error('请选择不超过 2 MB 的 WebVTT 字幕');
   const text=await file.text();if(generation!==subtitleRequest.current)return;
   if(!/^WEBVTT(?:[ \t]|\r?\n|$)/.test(text.trimStart()))throw new Error('请选择有效的 WebVTT 字幕');
   setSubtitle(URL.createObjectURL(file));setStatus('本地字幕已加载');
  }catch(error){const message=error instanceof Error?error.message:'';if(generation===subtitleRequest.current)setStatus(message.includes('WebVTT')?message:'字幕文件读取失败，请重新选择文件');}
  finally{if(generation===subtitleRequest.current)input.value='';}
 };
 return <div className={'advanced-player '+(pageFullscreen?'player-window-fullscreen':'')} ref={stage} tabIndex={0} aria-label="播放器，空格播放暂停，方向键快进快退"><div className="video-surface" onDoubleClick={()=>void toggleFullscreen()}><video ref={video} crossOrigin={cors?'anonymous':undefined} controls={!enhanced} autoPlay={!pauseAfterReload.current} playsInline {...{'x-webkit-airplay':'allow'}} onPlaying={()=>{pauseAfterReload.current=false;clearBuffer();setLoading(false);setNeedsPlay(false);setStatus('');if(!confirmed.current){confirmed.current=true;callbacks.current.onReady?.();}}} onWaiting={buffering} onSeeking={buffering} onSeeked={()=>{if(restoring.current&&Math.abs(video.current!.currentTime-currentPosition.current)>.5)return;restoring.current=false;clearBuffer();setLoading(false);}} onPause={()=>{clearBuffer();setLoading(false);commit();}} onEnded={()=>{clearBuffer();commit();callbacks.current.onEnded?.();}} onTimeUpdate={e=>{if(e.currentTarget.readyState<1||restoring.current&&Math.abs(e.currentTarget.currentTime-currentPosition.current)>.5)return;restoring.current=false;if(e.currentTarget.readyState>=3){clearBuffer();setLoading(false);}currentPosition.current=e.currentTarget.currentTime;setTimeline(e.currentTarget.currentTime);callbacks.current.onTime(e.currentTarget.currentTime);}} onError={()=>{if(cors){setQuality('off');setEnhanced(false);setCors(false);setStatus('此源不允许跨域超分，已恢复普通播放');}else fail('浏览器无法播放此线路，请切换线路或视频源');}}>{subtitle&&<track key={subtitle} src={subtitle} kind="subtitles" label="本地字幕" srcLang="zh" default/>}</video>{(loading||needsPlay)&&<div className="player-feedback" role="status">{needsPlay?<button type="button" onClick={play}><Play size={23} fill="currentColor"/>点击播放</button>:<><RefreshCw className="spin" size={22}/><span>{hasFrame?'正在缓冲…':'正在加载视频…'}</span></>}</div>}<canvas ref={canvas} hidden={!enhanced} aria-label="Anime4K 超分画面"/><button className="fullscreen-exit" type="button" onClick={toggleFullscreen}><Minimize2 size={16}/>{pageFullscreen?'退出网页全屏':'退出全屏'}</button></div>
 {enhanced&&<div className="enhanced-controls"><button onClick={()=>{const v=video.current!;v.paused?play():v.pause();}}>播放 / 暂停</button><button onClick={()=>video.current!.currentTime=Math.max(0,video.current!.currentTime-10)}>−10 秒</button><input type="range" min="0" max={Number.isFinite(video.current?.duration)?video.current!.duration:0} value={timeline} onChange={e=>video.current!.currentTime=Number(e.target.value)} aria-label="播放进度"/><button onClick={()=>{if(Number.isFinite(video.current!.duration))video.current!.currentTime=Math.min(video.current!.duration,video.current!.currentTime+10);}}>+10 秒</button><button onClick={()=>video.current!.muted=!video.current!.muted}>静音切换</button></div>}
 <div className="player-toolbar"><span className="player-indicator"><i aria-hidden="true"/>站内播放</span><div><button type="button" onClick={pictureInPicture}><PictureInPicture2 size={16}/>画中画</button><button className="player-fullscreen" type="button" onClick={toggleFullscreen}>{(fullscreen||pageFullscreen)?<Minimize2 size={16}/>:<Maximize2 size={16}/>}<span>{pageFullscreen?'退出网页全屏':fullscreen?'退出全屏':'全屏播放'}</span></button></div></div>
 <details className="player-options"><summary><Settings2 size={15}/>播放设置 <span>倍速 · 画质 · 投屏 · 字幕</span></summary>
 <div className="playback-actions"><label>Anime4K <select value={quality} onChange={e=>{const q=e.target.value as typeof quality;setQuality(q);setStatus('');if(q!=='off'&&!cors){pauseAfterReload.current=video.current!.readyState>=1&&video.current!.paused;if(!restoring.current)currentPosition.current=video.current!.currentTime;setCors(true);}}}><option value="off">关闭</option><option value="balanced">2× 均衡</option><option value="quality">2× 高质量</option></select></label><label>倍速 <select value={speed} onChange={e=>{const n=Number(e.target.value);setSpeed(n);video.current!.playbackRate=n;try{localStorage.setItem('kw-player-speed',String(n));}catch{}}}>{[0.5,0.75,1,1.25,1.5,2].map(n=><option value={n} key={n}>{n}×</option>)}</select></label>
 <button onClick={()=>run(remote)}>AirPlay / 远程播放</button><button onClick={()=>run(async()=>{if(!castReady){await loadCast();setCastReady(true);setStatus('Google Cast 已就绪，再点击选择设备');}else {setCast(await castVideo(video.current!,castUrl||new URL(activeUrl,window.location.origin).href));setStatus('已投屏：接收器播放原始视频');}})}>{castReady?'Google Cast 投屏':'启用 Google Cast'}</button>
 <label className="subtitle-upload">导入 VTT 字幕<input type="file" accept=".vtt" hidden onChange={importSubtitle}/></label>{subtitle&&<button onClick={()=>setSubtitle('')}>移除字幕</button>}</div>
 {cast&&<div className="playback-actions"><button onClick={()=>cast.toggle()}>投屏播放 / 暂停</button><button onClick={()=>cast.seek(-10)}>投屏 −10 秒</button><button onClick={()=>cast.seek(10)}>投屏 +10 秒</button><button onClick={()=>{cast.disconnect();setCast(null);setStatus('投屏已断开');}}>停止投屏</button></div>}
 <p className="footnote">超分需要 WebGPU 和允许跨域的视频；投屏需要同一网络的兼容设备。超分仅作用于本机画面。</p></details>
 {status&&<p className="player-status" role="status">{status}</p>}</div>;
}
