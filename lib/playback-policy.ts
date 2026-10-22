export type MemoryPolicy='auto'|'low'|'normal';
export function limitedPlayback(policy:MemoryPolicy,connection?:{saveData?:boolean;effectiveType?:string}){return policy==='low'||policy==='auto'&&!!(connection?.saveData||['slow-2g','2g','3g'].includes(connection?.effectiveType||''));}
export function hlsBufferPolicy(low:boolean){return {maxBufferLength:low?15:30,maxMaxBufferLength:low?30:120,backBufferLength:low?15:60,maxBufferSize:(low?12:60)*1024*1024,capLevelToPlayerSize:low};}
export type PlaybackConnection={saveData?:boolean;effectiveType?:string;addEventListener?:(event:string,fn:()=>void)=>void;removeEventListener?:(event:string,fn:()=>void)=>void};
