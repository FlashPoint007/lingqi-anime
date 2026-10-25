type AppleVideo=HTMLVideoElement & {
 webkitDisplayingFullscreen?:boolean;webkitEnterFullscreen?:()=>void;webkitExitFullscreen?:()=>void;
 webkitPresentationMode?:string;webkitSupportsPresentationMode?:(mode:string)=>boolean;
 webkitSetPresentationMode?:(mode:string)=>void;
};
// iOS can ignore or reject programmatic volume changes. Never report a change
// that did not happen, and keep the rest of the controls usable.
export function setMediaVolume(video:HTMLVideoElement,value:number){
 if(!Number.isFinite(value))return false;
 const next=Math.max(0,Math.min(1,value));
 try{video.volume=next;if(Math.abs(video.volume-next)>.01)return false;video.muted=false;return true;}catch{return false;}
}
export function toggleMediaMute(video:HTMLVideoElement,restore=.5){
 try{if(video.volume===0)return setMediaVolume(video,Number.isFinite(restore)&&restore>0?restore:.5);video.muted=!video.muted;return true;}catch{return false;}
}
export function mediaFullscreen(video:HTMLVideoElement,stage:HTMLElement,doc:Document=document){
 return doc.fullscreenElement===stage||doc.fullscreenElement===video||(video as AppleVideo).webkitDisplayingFullscreen===true;
}
export async function nativeFullscreen(video:HTMLVideoElement,stage:HTMLElement,doc:Document=document){
 const apple=video as AppleVideo;
 if(apple.webkitDisplayingFullscreen&&apple.webkitExitFullscreen){apple.webkitExitFullscreen();return true;}
 if(doc.fullscreenElement){try{await doc.exitFullscreen();return true;}catch{return false;}}
 if(stage.requestFullscreen)try{await stage.requestFullscreen();return true;}catch{/* Try the iPhone video-only API before webpage fullscreen. */}
 if(apple.webkitEnterFullscreen)try{apple.webkitEnterFullscreen();return true;}catch{}
 return false;
}
export async function togglePictureInPicture(video:HTMLVideoElement,doc:Document=document){
 if(doc.pictureInPictureElement===video&&doc.exitPictureInPicture){await doc.exitPictureInPicture();return false;}
 const apple=video as AppleVideo;
 if(apple.webkitPresentationMode==='picture-in-picture'&&apple.webkitSetPresentationMode){apple.webkitSetPresentationMode('inline');return false;}
 if(video.readyState<2)throw Error('视频加载完成后可开启画中画');
 if(doc.pictureInPictureEnabled&&video.requestPictureInPicture){await video.requestPictureInPicture();return true;}
 if(apple.webkitSupportsPresentationMode?.('picture-in-picture')&&apple.webkitSetPresentationMode){apple.webkitSetPresentationMode('picture-in-picture');return true;}
 throw Error('当前浏览器或设备不支持画中画');
}
