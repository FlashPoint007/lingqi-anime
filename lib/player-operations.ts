import {setMediaVolume,toggleMediaMute} from './player-compat';
import type {PlayerAction,PlayerPreferences} from './player-preferences';
type Options={video:HTMLVideoElement;stage:HTMLElement;surface:HTMLElement;preferences:()=>PlayerPreferences;play:()=>void;mute?:()=>void;seek:(delta:number)=>unknown;action:(action:PlayerAction)=>void;message:(message:string)=>void;brightness:(n:number)=>void;suppressClick:()=>void};
export function bindPlayerOperations(o:Options){
 const {video:v,stage,surface}=o;let timer:ReturnType<typeof setTimeout>|undefined,held=false,oldRate=1,key='',pointer:{id:number;x:number;y:number;position:number;volume:number;brightness:number;axis:string}|undefined,brightness=1;
 const stopHold=()=>{clearTimeout(timer);timer=undefined;if(held){held=false;try{v.playbackRate=oldRate;if(Math.abs(v.playbackRate-oldRate)>.01)throw Error();o.message('');}catch{o.message('此设备无法恢复原倍速，请在播放设置中重新选择');}}};
 const beginHold=()=>{stopHold();timer=setTimeout(()=>{timer=undefined;if(v.paused||v.ended)return;const previous=v.playbackRate,next=o.preferences().holdSpeed;o.suppressClick();try{v.playbackRate=next;if(Math.abs(v.playbackRate-next)>.01)throw Error();oldRate=previous;held=true;o.message('临时 '+next+'× 倍速');}catch{try{if(v.playbackRate!==previous)v.playbackRate=previous;}catch{}o.message('此设备不支持临时倍速，请在播放设置中选择可用倍速');}},450);};
 const editable=(target:EventTarget|null)=>typeof (target as Element|null)?.closest==='function'&&!!(target as Element).closest('input,textarea,select,button,summary,[contenteditable=true],[role=slider]');
 const down=(e:KeyboardEvent)=>{
  if(editable(e.target)||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;const code=e.code||({' ':'Space',f:'KeyF',F:'KeyF'} as Record<string,string>)[e.key]||e.key;
  const prefs=o.preferences(),action=(Object.entries(prefs.shortcuts).find(([,value])=>value===code)?.[0]) as PlayerAction|undefined;if(!action)return;e.preventDefault();if(e.repeat)return;
  if(action==='forward'){o.seek(prefs.seekStep);key=code;beginHold();}
  else if(action==='back')o.seek(-prefs.seekStep);else if(action==='play')v.paused?o.play():v.pause();else if(action==='mute'){if(o.mute)o.mute();else if(!toggleMediaMute(v))o.message('此设备请使用系统音量键调节音量');}else o.action(action);
 };
 const up=(e:KeyboardEvent)=>{if((e.code||e.key)===key){stopHold();key='';}};
 const pointerDown=(e:PointerEvent)=>{if(e.button!==0||editable(e.target)||pointer)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,position:v.currentTime,volume:v.volume,brightness,axis:''};beginHold();};
 const pointerMove=(e:PointerEvent)=>{
  if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(Math.abs(dx)+Math.abs(dy)<12)return;stopHold();if(!o.preferences().gestures||e.pointerType==='mouse')return;
  e.preventDefault();o.suppressClick();const bounds=surface.getBoundingClientRect();if(!pointer.axis)pointer.axis=Math.abs(dx)>Math.abs(dy)?'seek':pointer.x<bounds.left+bounds.width/2?'brightness':'volume';
  if(pointer.axis==='seek'){const delta=dx/Math.max(bounds.width,1)*120;o.message('松开跳转至 '+Math.floor(Math.max(0,Math.min(v.duration||0,pointer.position+delta)))+' 秒');}
  else if(pointer.axis==='volume'){const changed=setMediaVolume(v,pointer.volume-dy/Math.max(bounds.height,1));o.message(changed?'音量 '+Math.round(v.volume*100)+'%':'此设备请使用系统音量键调节音量');}
  else{brightness=Math.max(.25,Math.min(1.5,pointer.brightness-dy/Math.max(bounds.height,1)));o.brightness(brightness);o.message('画面亮度 '+Math.round(brightness*100)+'%');}
 };
 const pointerEnd=(e:PointerEvent)=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;pointer=undefined;const wasHeld=held;stopHold();if(wasHeld)o.suppressClick();if(p.axis==='seek'&&e.type==='pointerup'){const width=surface.getBoundingClientRect().width;o.seek(p.position+(e.clientX-p.x)/Math.max(width,1)*120-v.currentTime);}if(p.axis){o.suppressClick();o.message('');}};
 const reset=()=>{pointer=undefined;key='';stopHold();};const visibility=()=>{if(document.visibilityState==='hidden')reset();};
 stage.addEventListener('keydown',down);stage.addEventListener('keyup',up);surface.addEventListener('pointerdown',pointerDown);surface.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerEnd);window.addEventListener('pointercancel',pointerEnd);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);
 return ()=>{reset();stage.removeEventListener('keydown',down);stage.removeEventListener('keyup',up);surface.removeEventListener('pointerdown',pointerDown);surface.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerEnd);window.removeEventListener('pointercancel',pointerEnd);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);};
}
