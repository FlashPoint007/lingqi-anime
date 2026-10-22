'use client';
import {useEffect,useState,type RefObject} from 'react';
import {playbackSnapshot,type DiagnosticEvent} from '../lib/playback-diagnostics';
type Snapshot=ReturnType<typeof playbackSnapshot>;
export default function PlaybackDiagnostics({video,hls,events,low}:{video:RefObject<HTMLVideoElement|null>;hls:()=>Parameters<typeof playbackSnapshot>[1];events:RefObject<DiagnosticEvent[]>;low:boolean}){
 const [open,setOpen]=useState(false),[snapshot,setSnapshot]=useState<Snapshot>(),[logs,setLogs]=useState<DiagnosticEvent[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{if(!open)return;const read=()=>{if(video.current)setSnapshot(playbackSnapshot(video.current,hls()));setLogs([...events.current]);};read();const timer=setInterval(read,1000);return()=>clearInterval(timer);},[open,video,events]);
 return <details className="playback-diagnostics" onToggle={e=>setOpen(e.currentTarget.open)}><summary>播放诊断 <span>画面 · 缓冲 · 错误记录</span></summary>{open&&<div><p>{low?'低内存策略已启用':'标准缓冲策略'}{snapshot?.内核==='浏览器原生'?'；当前缓存由浏览器管理，无法设置精确预算。':'；HLS 缓冲预算已应用，不代表整个页面的内存上限。'}</p><dl>{snapshot&&Object.entries(snapshot).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><div className="button-row"><button type="button" onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(JSON.stringify({snapshot,events:logs},null,2));setMessage('已复制诊断信息，未包含视频签名或账号凭证');}catch{setMessage('无法复制，请手动选择诊断内容');}})();}}>复制诊断信息</button><button type="button" onClick={()=>{events.current=[];setLogs([]);}}>清空记录</button></div>{message&&<p role="status">{message}</p>}<ol>{logs.map((log,index)=><li key={index}><time>{new Date(log.time).toLocaleTimeString()}</time> <b>{log.event}</b> {log.message}</li>)}</ol><p>仅保留本次播放的最近 40 条记录，不上传服务器。关闭面板停止采样。</p></div>}</details>;
}
