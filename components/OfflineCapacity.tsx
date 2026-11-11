'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw,HardDrive} from 'lucide-react';
import {offlineStoredBytes} from '../lib/offline-downloads';
import {CAPACITY_REFRESH_MS,capacityDeadline,readStorageCapacity,storageSize,type StorageCapacity} from '../lib/storage-capacity';
import './offline-capacity.css';

type Snapshot={owner:string;loading:boolean;bytes?:number;storage?:StorageCapacity;updatedAt?:number};
export default function OfflineCapacity({owner}:{owner:string}){
 const [snapshot,setSnapshot]=useState<Snapshot>({owner,loading:true}),scope=useRef({owner}),refresh=useRef<()=>void>(()=>{});
 if(scope.current.owner!==owner)scope.current={owner};
 useEffect(()=>{
  const current=scope.current;let alive=true,busy=false,dirty=false,last=0,timer:ReturnType<typeof setTimeout>|undefined;
  const active=()=>alive&&scope.current===current;
  const update=async(force=false)=>{
   if(!active())return;if(busy){dirty=true;return;}
   const delay=CAPACITY_REFRESH_MS-(Date.now()-last);
   if(!force&&delay>0){if(!timer)timer=setTimeout(()=>{timer=undefined;void update();},delay);return;}
   clearTimeout(timer);timer=undefined;last=Date.now();busy=true;
   setSnapshot(previous=>previous.owner===owner?{...previous,loading:true}:{owner,loading:true});
   const [saved,estimate]=await Promise.allSettled([capacityDeadline(()=>offlineStoredBytes(owner)),readStorageCapacity(navigator.storage)]);
   if(active())setSnapshot({owner,loading:false,bytes:saved.status==='fulfilled'?saved.value:undefined,storage:estimate.status==='fulfilled'?estimate.value:{state:'unavailable'},updatedAt:Date.now()});
   busy=false;if(dirty){dirty=false;void update();}
  };
  const changed=()=>void update(),visible=()=>{if(document.visibilityState==='visible')void update();};
  refresh.current=()=>void update(true);void update(true);
  window.addEventListener('lingqi-downloads',changed);document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;clearTimeout(timer);window.removeEventListener('lingqi-downloads',changed);document.removeEventListener('visibilitychange',visible);};
 },[owner]);
 const view=snapshot.owner===owner?snapshot:{owner,loading:true},storage=view.storage;
 const low=storage?.state==='ready'&&storage.available<128*1024*1024;
 return <section className="offline-capacity" aria-label="离线存储容量" aria-busy={view.loading}>
  <div className="offline-capacity-heading"><h3><HardDrive size={17}/>离线存储容量</h3><button type="button" className="secondary" onClick={()=>refresh.current()} disabled={view.loading}><RefreshCw size={13}/>{view.loading?'统计中…':'刷新容量'}</button></div>
  <dl className="offline-capacity-stats">
   <div><dt>当前个人空间 · 已保存视频</dt><dd>{view.bytes===undefined?(view.loading?'统计中…':'无法读取'):storageSize(view.bytes)}</dd></div>
   <div><dt>本站总占用</dt><dd>{storage?.state==='ready'?storageSize(storage.usage):view.loading?'统计中…':'未知'}</dd></div>
   <div><dt>本站预计可用</dt><dd>{storage?.state==='ready'?storageSize(storage.available):view.loading?'统计中…':'未知'}</dd></div>
  </dl>
  {storage?.state==='ready'&&<div className="offline-capacity-meter"><progress aria-label="本站存储额度使用比例" max="1" value={storage.ratio}/><small>浏览器给予本站的预计额度 {storageSize(storage.quota)} · 已用 {Math.round(storage.ratio*100)}%</small></div>}
  {low&&<p className="offline-capacity-warning" role="status">本站预计可用空间低于 128 MiB。建议先删除已看完的离线视频，再保存新剧集；未完成的分片也会占用空间。</p>}
  {!view.loading&&storage?.state!=='ready'&&<p className="offline-capacity-note" role="status">{storage?.state==='unsupported'?'当前浏览器不提供站点容量估算，仍可查看已保存的视频大小。':'暂时无法读取浏览器容量，可点击“刷新容量”重试。'}</p>}
  {!view.loading&&view.bytes===undefined&&<p className="offline-capacity-note">离线视频大小读取失败，请检查浏览器存储设置后刷新。</p>}
  <p className="offline-capacity-note">视频大小按已写入的分片统计，包含暂停的任务。本站总占用还包括其他个人空间、弹幕和缓存；可用空间是浏览器对本站的估算，并非磁盘剩余空间，不包含“下载到本地”的文件。</p>
  {view.updatedAt&&<small className="offline-capacity-updated">更新于 {new Date(view.updatedAt).toLocaleTimeString('zh-CN',{hour12:false})} · 下载期间自动更新</small>}
 </section>;
}
