'use client';
import {useEffect,useRef,type RefObject} from 'react';
import {type DanmakuComment,type DanmakuSettings} from '../lib/danmaku';
import {advancedDanmaku} from '../lib/danmaku-blocks';
import {layoutDanmaku,activeDanmaku} from '../lib/danmaku-layout';
export default function DanmakuOverlay({media,comments,settings}:{media:RefObject<HTMLVideoElement|null>;comments:DanmakuComment[];settings:DanmakuSettings}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const v=media.current,c=canvas.current;if(!v||!c)return;const context=c.getContext('2d');if(!context)return;
  let frame=0,width=0,height=0,rows:ReturnType<typeof layoutDanmaku>=[],disposed=false,lastTime=-Infinity;
  const filtered=advancedDanmaku(comments,settings),font=`600 ${settings.fontSize}px system-ui, "Noto Sans SC", sans-serif`;
  const draw=()=>{
   const time=v.currentTime-settings.offset;if(time===lastTime)return;lastTime=time;context.clearRect(0,0,width,height);
   if(!settings.enabled||v.readyState<2||v.seeking){c.dataset.active='0';return;}
   const active=activeDanmaku(rows,time,8/settings.speed);c.dataset.active=String(active.length);
   context.font=font;context.textBaseline='alphabetic';context.globalAlpha=settings.opacity;context.lineWidth=3;context.strokeStyle='rgba(0,0,0,.85)';context.lineJoin='round';
   for(const row of active){const x=row.comment[1]===1?width-(time-row.start)*row.velocity:(width-row.width)/2;context.fillStyle='#'+row.comment[2].toString(16).padStart(6,'0');context.strokeText(row.comment[3],x,row.y,width*2);context.fillText(row.comment[3],x,row.y,width*2);}
  };
  const resize=()=>{
   const rect=v.getBoundingClientRect(),aspect=v.videoWidth&&v.videoHeight?v.videoWidth/v.videoHeight:rect.width/Math.max(1,rect.height);
   width=Math.max(1,Math.min(rect.width,rect.height*aspect));height=Math.max(1,Math.min(rect.height,rect.width/aspect));const ratio=Math.min(2,window.devicePixelRatio||1);
   c.style.width=width+'px';c.style.height=height+'px';c.style.left=(rect.width-width)/2+'px';c.style.top=(rect.height-height)/2+'px';c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);context.font=font;
   rows=layoutDanmaku(filtered,width,height,settings,text=>context.measureText(text).width);c.dataset.scheduled=String(rows.length);lastTime=-Infinity;draw();
  };
  const tick=()=>{frame=0;if(disposed)return;draw();if(!v.paused&&!v.ended&&settings.enabled&&!document.hidden)frame=requestAnimationFrame(tick);};
  const wake=()=>{lastTime=-Infinity;if(!frame)tick();};
  const events=['play','pause','seeked','seeking','timeupdate','ended','ratechange','loadeddata','emptied'] as const;
  for(const event of events)v.addEventListener(event,wake);v.addEventListener('resize',resize);document.addEventListener('visibilitychange',wake);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):undefined;observer?.observe(v);window.addEventListener('resize',resize);resize();wake();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',resize);v.removeEventListener('resize',resize);for(const event of events)v.removeEventListener(event,wake);document.removeEventListener('visibilitychange',wake);context.clearRect(0,0,width,height);};
 },[media,comments,settings]);
 return <canvas ref={canvas} className="danmaku-canvas" aria-label="弹幕画面" data-count={comments.length} hidden={!settings.enabled}/>;
}
