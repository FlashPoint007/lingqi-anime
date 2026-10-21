export type VideoFit='contain'|'cover'|'fill'|'4:3';
export const shortcutLabels={play:'播放 / 暂停',forward:'快进 / 按住倍速',back:'后退',fullscreen:'全屏',mute:'静音',next:'下一集',previous:'上一集',screenshot:'截图'};
export type PlayerAction=keyof typeof shortcutLabels;
export type PlayerPreferences={seekStep:number;skipSeconds:number;fit:VideoFit;holdSpeed:number;gestures:boolean;shortcuts:Record<PlayerAction,string>};
const shortcuts={play:'Space',forward:'ArrowRight',back:'ArrowLeft',fullscreen:'KeyF',mute:'KeyM',next:'KeyN',previous:'KeyP',screenshot:'KeyS'};
export const defaultPlayerPreferences:PlayerPreferences={seekStep:10,skipSeconds:90,fit:'contain',holdSpeed:2,gestures:true,shortcuts};
export function playerPreferences(value:unknown):PlayerPreferences{
 const v=value as Partial<PlayerPreferences>|null,bindings={...shortcuts},used=new Set<string>();
 for(const action of Object.keys(bindings) as PlayerAction[]){const key=v?.shortcuts?.[action];if(typeof key==='string'&&/^(?:Key[A-Z]|Digit\d|Space|Arrow(?:Right|Left|Up|Down))$/.test(key)&&!used.has(key)){bindings[action]=key;used.add(key);}else used.add(bindings[action]);}
 if(new Set(Object.values(bindings)).size!==Object.keys(bindings).length)Object.assign(bindings,shortcuts);
 return {seekStep:typeof v?.seekStep==='number'&&Number.isInteger(v.seekStep)&&v.seekStep>=1&&v.seekStep<=120?v.seekStep:10,skipSeconds:typeof v?.skipSeconds==='number'&&Number.isInteger(v.skipSeconds)&&v.skipSeconds>=5&&v.skipSeconds<=600?v.skipSeconds:90,fit:['contain','cover','fill','4:3'].includes(v?.fit||'')?v!.fit!:'contain',holdSpeed:typeof v?.holdSpeed==='number'&&[1.5,2,2.5,3,4].includes(v.holdSpeed)?v.holdSpeed:2,gestures:v?.gestures!==false,shortcuts:bindings};
}
