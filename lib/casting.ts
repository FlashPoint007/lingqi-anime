let loading:Promise<void>|undefined;
export function loadCast():Promise<void>{
 const w=window as any;if(w.cast?.framework)return Promise.resolve();if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Google Cast SDK 加载超时')),15000);w.__onGCastApiAvailable=(ok:boolean)=>{clearTimeout(timeout);if(!ok){reject(new Error('当前浏览器不支持 Google Cast'));return;}w.cast.framework.CastContext.getInstance().setOptions({receiverApplicationId:w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,autoJoinPolicy:w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED});resolve();};const script=document.createElement('script');script.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';script.onerror=()=>{clearTimeout(timeout);reject(new Error('Google Cast SDK 无法加载'));};document.head.appendChild(script);}).catch(e=>{loading=undefined;throw e;});return loading!;
}
export type CastMetadata={title?:string;episode?:string;poster?:string;mediaType?:'hls'|'video'};
export async function castVideo(video:HTMLVideoElement,url:string,details:CastMetadata={},isCurrent:()=>boolean=()=>true){
 const address=new URL(url);if(address.protocol!=='https:'||address.username||address.password||address.pathname.startsWith('/__offline_media/'))throw new Error('此视频地址不能由投屏设备读取，请使用在线 HTTPS 视频');
 const source=video.currentSrc||video.src,current=()=>isCurrent()&&(video.currentSrc||video.src)===source;
 const check=()=>{if(!current())throw new Error('播放剧集已切换，请在当前集重新投屏');};
 const w=window as any,type=details.mediaType==='hls'||/\.m3u8(?:[?#]|$)/i.test(url)?'application/x-mpegURL':/\.webm(?:[?#]|$)/i.test(url)?'video/webm':'video/mp4';
 // Describe the media associated with this request, even while a device picker
 // is open. A receiver cannot use files stored only in this browser's IDB.
 const info=new w.chrome.cast.media.MediaInfo(url,type),metadata=new w.chrome.cast.media.GenericMediaMetadata(),clean=(value:string|undefined)=>value?.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200)||'';
 metadata.title=clean(details.title)||'零柒番剧';metadata.subtitle=clean(details.episode);
 if(details.poster){try{const poster=new URL(details.poster);if(poster.protocol==='https:'&&!poster.username&&!poster.password)metadata.images=[new w.chrome.cast.Image(poster.href)];}catch{/* Optional artwork must not prevent playback. */}}
 info.metadata=metadata;
 const context=w.cast.framework.CastContext.getInstance();await context.requestSession();check();const session=context.getCurrentSession();if(!session)throw new Error('没有连接到投屏设备');
 const request=new w.chrome.cast.media.LoadRequest(info);request.currentTime=video.currentTime;request.autoplay=!video.paused;await session.loadMedia(request);check();video.pause();
 return {disconnect:()=>context.endCurrentSession(true),toggle:()=>{const media=session.getMediaSession();if(!media)return;media.playerState==='PLAYING'?media.pause(null):media.play(null);},seek:(seconds:number)=>{const r=new w.chrome.cast.media.SeekRequest();r.currentTime=Math.max(0,(session.getMediaSession()?.currentTime||0)+seconds);session.getMediaSession()?.seek(r);}};
}
