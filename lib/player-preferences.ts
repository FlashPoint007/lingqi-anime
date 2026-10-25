import type {MemoryPolicy} from './playback-policy';
export type VideoFit='contain'|'cover'|'fill'|'4:3';
export const shortcutLabels={play:'播放 / 暂停',forward:'快进 / 按住倍速',back:'后退',fullscreen:'全屏',mute:'静音',next:'下一集',previous:'上一集',screenshot:'截图'};
export type PlayerAction=keyof typeof shortcutLabels;
export type PlayerPreferences={memory:MemoryPolicy;seekStep:number;skipSeconds:number;fit:VideoFit;holdSpeed:number;gestures:boolean;speed:number;volume:number;muted:boolean;shortcuts:Record<PlayerAction,string>};
export const playbackSpeeds=Array.from({length:12},(_,i)=>(i+1)/4);
const shortcuts={play:'Space',forward:'ArrowRight',back:'ArrowLeft',fullscreen:'KeyF',mute:'KeyM',next:'KeyN',previous:'KeyP',screenshot:'KeyS'};
export const defaultPlayerPreferences:PlayerPreferences={memory:'auto',seekStep:10,skipSeconds:90,fit:'contain',holdSpeed:2,gestures:true,speed:1,volume:1,muted:false,shortcuts};
export function playerPreferences(value:unknown):PlayerPreferences{
 const v=value as Partial<PlayerPreferences>|null,bindings={...shortcuts},used=new Set<string>();
 for(const action of Object.keys(bindings) as PlayerAction[]){const key=v?.shortcuts?.[action];if(typeof key==='string'&&/^(?:Key[A-Z]|Digit\d|Space|Arrow(?:Right|Left|Up|Down))$/.test(key)&&!used.has(key)){bindings[action]=key;used.add(key);}else used.add(bindings[action]);}
 if(new Set(Object.values(bindings)).size!==Object.keys(bindings).length)Object.assign(bindings,shortcuts);
 return {memory:['auto','low','normal'].includes(v?.memory||'')?v!.memory!:'auto',seekStep:typeof v?.seekStep==='number'&&Number.isInteger(v.seekStep)&&v.seekStep>=1&&v.seekStep<=120?v.seekStep:10,skipSeconds:typeof v?.skipSeconds==='number'&&Number.isInteger(v.skipSeconds)&&v.skipSeconds>=5&&v.skipSeconds<=600?v.skipSeconds:90,fit:['contain','cover','fill','4:3'].includes(v?.fit||'')?v!.fit!:'contain',holdSpeed:typeof v?.holdSpeed==='number'&&[1.5,2,2.5,3,4].includes(v.holdSpeed)?v.holdSpeed:2,gestures:v?.gestures!==false,speed:typeof v?.speed==='number'&&playbackSpeeds.includes(v.speed)?v.speed:1,volume:typeof v?.volume==='number'&&Number.isFinite(v.volume)&&v.volume>=0&&v.volume<=1?v.volume:1,muted:v?.muted===true,shortcuts:bindings};
}
export function readPlayerPreferences(read:(key:string)=>string|null){
 let raw:Partial<PlayerPreferences>|null=null;try{raw=JSON.parse(read('kw-player-preferences')||'null');}catch{}
 const prefs=playerPreferences(raw);if(raw?.speed===undefined)try{const legacy=Number(read('kw-player-speed'));if(playbackSpeeds.includes(legacy))prefs.speed=legacy;}catch{}
 return prefs;
}
