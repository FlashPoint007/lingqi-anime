'use client';
import {useEffect,useState} from 'react';
import {Download,Trash2} from 'lucide-react';
import {activeDownload,deleteDownload,downloads,downloadEpisode,type OfflineDownload} from '../lib/offline-downloads';
import type {Subject} from '../lib/catalog';
const size=(n:number)=>(n/1048576).toFixed(1)+' MB';
export function DownloadEpisode({owner,subject,episode,number,url,sourceUrl,source,ruleName,mediaType}:{owner:string;subject:Subject;episode:string;number?:number;url:string;sourceUrl:string;source?:string;ruleName?:string;mediaType?:'hls'|'video'}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const changed=()=>setBusy(!!activeDownload());changed();window.addEventListener('lingqi-downloads',changed);return()=>window.removeEventListener('lingqi-downloads',changed);},[]);
 const start=async()=>{setMessage('');try{await downloadEpisode({owner,subject,episode,number,url,sourceUrl,source,ruleName,mediaType},setMessage);}catch(error){setMessage((error as Error).name==='AbortError'?'下载已取消，残片已清理':(error as Error).message);}};
 return <section className="watch-download" aria-label="下载当前剧集"><button type="button" className="secondary" disabled={busy||!url} onClick={()=>void start()}><Download size={15}/>{busy?'下载任务进行中':'下载本集'}</button>{busy&&<button type="button" onClick={()=>{const id=activeDownload();if(id)void deleteDownload(id);}}>取消下载</button>}<a href="/offline">本机离线列表</a><p role="status">{message||'仅保存在本机。下载时保持页面打开，单集最多 1 GB。'}</p></section>;
}
export default function OfflineDownloads({owner}:{owner:string}){
 const [items,setItems]=useState<OfflineDownload[]>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;const load=()=>{downloads(owner).then(items=>{if(alive)setItems(items);}).catch(()=>{if(alive)setError('浏览器存储不可用，请检查隐私设置或换一个浏览器');});};load();window.addEventListener('lingqi-downloads',load);const timer=setInterval(load,2500);return()=>{alive=false;window.removeEventListener('lingqi-downloads',load);clearInterval(timer);};},[owner]);
 return <section className="offline-library"><div className="offline-intro"><h2>把下一集，留在本机。</h2><p>在播放页点击“下载本集”，下载完成后断网也能观看。视频不进入本站数据库。</p><a className="secondary" href="/offline">打开离线放映室</a></div>{error&&<p className="notice error">{error}</p>}{items.map(item=><article key={item.id} className="offline-download"><div><h3>{item.subject.name_cn||item.subject.name}</h3><p>{item.episode} · {size(item.bytes)} · {item.status==='complete'?'可离线观看':item.status==='downloading'&&activeDownload()===item.id?'正在下载…':'下载中断，请回播放页重新下载'}</p>{item.error&&<small>{item.error}</small>}</div>{item.status==='complete'&&<a className="secondary" href={'/offline#'+item.id}>离线播放</a>}<button type="button" className="icon-button" aria-label={'删除下载 '+item.episode} onClick={()=>void deleteDownload(item.id).catch(()=>setError('删除失败，请重试'))}><Trash2 size={17}/></button></article>)}{!items.length&&<p className="empty">还没有下载，在播放页选好线路后下载一集试试。</p>}<p className="footnote">下载仅属于当前设备和浏览器，清理网站数据会删除视频。退出登录不会删除下载，共享设备请主动清理。不支持直播、加密 HLS 或独立音轨；源站必须允许读取。离开网站会中断未完成任务，可回播放页重新下载。</p></section>;
}
