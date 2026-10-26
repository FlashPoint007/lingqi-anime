'use client';
import {useRef,useState,type PointerEvent} from 'react';
import {playbackTime,progressTime} from '../lib/player-controls';
type Props={current:number;duration:number;buffered:number;step?:number;onSeek:(time:number)=>void;onStep:(delta:number)=>number|undefined};
export default function PlayerProgress({current,duration,buffered,step=10,onSeek,onStep}:Props){
 const [preview,setPreview]=useState<number>(),[draft,setDraft]=useState<number>(),[cancelled,setCancelled]=useState(false);
 const drag=useRef<{id:number;time:number;cancelled:boolean}|undefined>(undefined),enabled=Number.isFinite(duration)&&duration>0;
 const value=Math.max(0,Math.min(enabled?duration:0,draft??current)),percent=(n:number)=>enabled?Math.max(0,Math.min(100,n/duration*100)):0;
 const position=(event:PointerEvent<HTMLDivElement>)=>{const r=event.currentTarget.getBoundingClientRect();return {time:progressTime(event.clientX,r.left,r.width,duration),outside:event.clientX<r.left-24||event.clientX>r.right+24||event.clientY<r.top-70||event.clientY>r.bottom+70};};
 const cancel=()=>{drag.current=undefined;setDraft(undefined);setPreview(undefined);setCancelled(false);};
 return <div className="player-progress-row"><span className="player-time">{playbackTime(value)}</span><div className="player-progress" role="slider" aria-label="播放进度" aria-valuemin={0} aria-valuemax={enabled?duration:0} aria-valuenow={value} aria-valuetext={playbackTime(value)+' / '+playbackTime(enabled?duration:NaN)} aria-disabled={!enabled} tabIndex={enabled?0:-1}
  onPointerDown={event=>{if(!enabled||event.button!==0||drag.current)return;const p=position(event);drag.current={id:event.pointerId,time:p.time,cancelled:false};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus();setDraft(p.time);setPreview(p.time);setCancelled(false);}}
  onPointerMove={event=>{if(!enabled)return;const p=position(event);if(drag.current?.id===event.pointerId){drag.current={id:event.pointerId,time:p.time,cancelled:p.outside};setDraft(p.time);setCancelled(p.outside);}setPreview(p.time);}}
  onPointerUp={event=>{const session=drag.current;if(!session||session.id!==event.pointerId)return;const p=position(event);cancel();if(!session.cancelled&&!p.outside&&enabled){onSeek(p.time);setPreview(p.time);}if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
  onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}} onPointerLeave={()=>{if(!drag.current)setPreview(undefined);}} onFocus={()=>{if(enabled)setPreview(current);}} onBlur={()=>{if(!drag.current)setPreview(undefined);}}
  onKeyDown={event=>{if(event.key==='Escape'){if(drag.current){event.preventDefault();event.stopPropagation();cancel();}return;}if(!enabled)return;let target:number|undefined;if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)){event.preventDefault();event.stopPropagation();target=onStep((['ArrowLeft','ArrowDown','PageDown'].includes(event.key)?-1:1)*(event.key.startsWith('Page')?60:step));}else if(event.key==='Home'||event.key==='End'){event.preventDefault();event.stopPropagation();target=event.key==='Home'?0:duration;onSeek(target);}if(target!==undefined)setPreview(target);}}>
  <span className="progress-track" aria-hidden="true"><i className="progress-buffer" style={{width:percent(buffered)+'%'}}/><i className="progress-played" style={{width:percent(value)+'%'}}/></span><span className="progress-thumb" aria-hidden="true" style={{left:percent(value)+'%'}}/>
  {preview!==undefined&&enabled&&<span className="progress-preview" role="tooltip" style={{left:Math.max(6,Math.min(94,percent(preview)))+'%'}}>{playbackTime(preview)}{draft!==undefined&&<small>{cancelled?'松开取消': '松开跳转 · Esc 取消'}</small>}</span>}
 </div><span className="player-time">{playbackTime(enabled?duration:NaN)}</span></div>;
}
