let loading:Promise<void>|undefined;
export function loadCast():Promise<void>{
 const w=window as any;if(w.cast?.framework)return Promise.resolve();if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Google Cast SDK 加载超时')),15000);w.__onGCastApiAvailable=(ok:boolean)=>{clearTimeout(timeout);if(!ok){reject(new Error('当前浏览器不支持 Google Cast'));return;}w.cast.framework.CastContext.getInstance().setOptions({receiverApplicationId:w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,autoJoinPolicy:w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED});resolve();};const script=document.createElement('script');script.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';script.onerror=()=>{clearTimeout(timeout);reject(new Error('Google Cast SDK 无法加载'));};document.head.appendChild(script);}).catch(e=>{loading=undefined;throw e;});return loading!;
}
export async function castVideo(video:HTMLVideoElement,url:string){
 const w=window as any;const context=w.cast.framework.CastContext.getInstance();await context.requestSession();const session=context.getCurrentSession();if(!session)throw new Error('没有连接到投屏设备');
 const type=/\.m3u8(?:\?|$)/i.test(url)?'application/x-mpegURL':/\.webm(?:\?|$)/i.test(url)?'video/webm':'video/mp4';const info=new w.chrome.cast.media.MediaInfo(url,type);const request=new w.chrome.cast.media.LoadRequest(info);request.currentTime=video.currentTime;request.autoplay=!video.paused;await session.loadMedia(request);video.pause();
 return {disconnect:()=>context.endCurrentSession(true),toggle:()=>{const media=session.getMediaSession();if(!media)return;media.playerState==='PLAYING'?media.pause(null):media.play(null);},seek:(seconds:number)=>{const r=new w.chrome.cast.media.SeekRequest();r.currentTime=Math.max(0,(session.getMediaSession()?.currentTime||0)+seconds);session.getMediaSession()?.seek(r);}};
}
