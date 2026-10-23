import {listOffline,updateOfflineProgress,removeOffline,offlineAssetURL} from './offline-db.mjs';
const library=document.getElementById('library'),video=document.getElementById('video'),message=document.getElementById('message');let current,hls,lastSave=0,restored=false,playRequest=0;
const owner=()=>{try{return JSON.parse(localStorage.getItem('kw-library-owner')||'null')||'anonymous';}catch{return 'anonymous';}};
const privatePlayback=()=>{try{return JSON.parse(localStorage.getItem('kw-private-playback')||'false')===true;}catch{return true;}};
const say=text=>{message.textContent=text;};
const size=n=>n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';
async function save(flush=false){
 if(!current||current.owner!==owner()||privatePlayback()||!restored||video.seeking||!Number.isFinite(video.currentTime)||video.readyState<1||!flush&&Date.now()-lastSave<5000)return;lastSave=Date.now();const id=current.id,position=video.currentTime;
 try{const next=await updateOfflineProgress(id,current.owner,{position,duration:Number.isFinite(video.duration)?video.duration:0,progressAt:Date.now()});if(next&&current?.id===id)current=next;}catch{say('本机进度保存失败，请检查浏览器存储空间');}
}
async function play(item){
 const request=++playRequest;await save(true);if(request!==playRequest||item.owner!==owner())return;restored=false;hls?.destroy();hls=undefined;video.pause();video.removeAttribute('src');video.load();current=item;lastSave=0;document.getElementById('playback').hidden=false;document.getElementById('player-title').textContent=(item.subject.name_cn||item.subject.name)+' · '+item.episode;say('正在读取本机视频…');
 const address=offlineAssetURL(item.id,item.entry);
 if(item.type==='hls'&&!video.canPlayType('application/vnd.apple.mpegurl')){if(!window.Hls?.isSupported()){say('此浏览器不支持离线 HLS，请使用新版 Chrome、Edge 或 Safari');return;}hls=new window.Hls({enableWorker:false});hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal)say('离线视频缺失或无法解码，请返回网站重新下载这一集');});hls.loadSource(address);hls.attachMedia(video);}else video.src=address;
 location.hash=item.id;video.scrollIntoView({block:'center',behavior:'smooth'});
}
video.addEventListener('loadedmetadata',()=>{if(!current)return;const resume=current.position>0&&current.position<video.duration-1;restored=!resume;if(resume)video.currentTime=current.position;say(privatePlayback()?'隐身观看：不保存本次进度':'正在播放本机下载，进度保存在本设备');void video.play().catch(()=>say('点击播放器开始离线观看'));});
video.addEventListener('seeked',()=>{if(current&&video.readyState>=1&&!video.seeking){restored=true;void save(true);}});
video.addEventListener('timeupdate',()=>void save());video.addEventListener('pause',()=>void save(true));video.addEventListener('ended',()=>void save(true));video.addEventListener('error',()=>say('本机视频无法播放，文件可能已被浏览器清理，请重新下载'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void save(true);});window.addEventListener('pagehide',()=>void save(true));
async function render(){
 library.replaceChildren();const items=(await listOffline()).filter(item=>item.owner===owner());if(!items.length){const p=document.createElement('p');p.id='empty';p.textContent='本机还没有下载。联网后在播放页点击“下载本集”。';library.append(p);return;}
 for(const item of items){const row=document.createElement('article');row.className='download';const copy=document.createElement('div'),heading=document.createElement('h3'),info=document.createElement('p');heading.textContent=item.subject.name_cn||item.subject.name;info.textContent=item.episode+' · '+(item.status==='complete'?size(item.bytes)+' · 可离线观看':size(item.bytes)+' · 下载已暂停，联网后可继续');copy.append(heading,info);row.append(copy);
  if(item.status==='complete'){const button=document.createElement('button');button.textContent='离线播放';button.addEventListener('click',()=>void play(item).catch(error=>say(error.message)));row.append(button);}
  if(item.status!=='complete'){const resume=document.createElement('a');resume.href='/#downloads';resume.textContent='联网继续下载';row.append(resume);}
  const remove=document.createElement('button');remove.textContent='删除下载';remove.addEventListener('click',async()=>{try{if(current?.id===item.id){const request=++playRequest;await save(true);if(request===playRequest){current=undefined;restored=false;video.pause();hls?.destroy();hls=undefined;video.removeAttribute('src');video.load();document.getElementById('playback').hidden=true;}}if(item.status==='downloading'){if(!navigator.locks){say('请联网返回下载页面，取消或移除未完成的任务');return;}const deleted=await navigator.locks.request('lingqi-offline-download',{ifAvailable:true},async lock=>{if(!lock)return false;await removeOffline(item.id);return true;});if(!deleted){say('另一个页面正在下载，请先在该页面取消任务');return;}}else await removeOffline(item.id);await render();say('已删除本机下载');}catch{say('删除失败，请重试');}});row.append(remove);library.append(row);
 }
 const selected=items.find(item=>item.id===location.hash.slice(1)&&item.status==='complete');if(selected&&!current)await play(selected);
}
window.addEventListener('storage',event=>{if(event.key==='kw-library-owner'){playRequest++;void save(true);current=undefined;restored=false;video.pause();hls?.destroy();hls=undefined;video.removeAttribute('src');video.load();document.getElementById('playback').hidden=true;void render();}});
try{if('serviceWorker' in navigator){await navigator.serviceWorker.register('/offline-sw.js',{scope:'/',type:'module',updateViaCache:'none'});await navigator.serviceWorker.ready;}await render();}catch(error){say('离线存储不可用：'+error.message);}
