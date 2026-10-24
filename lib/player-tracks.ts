import type Hls from 'hls.js';

type AudioTrack={label?:string;language?:string;enabled:boolean};
type TrackList<T>=ArrayLike<T>&{addEventListener?:(name:string,fn:()=>void)=>void;removeEventListener?:(name:string,fn:()=>void)=>void};
type TrackVideo=HTMLVideoElement&{audioTracks?:TrackList<AudioTrack>};
export type TrackOption={id:string;label:string};
export type MediaTracks={audio:TrackOption[];audioId:string;subtitles:TrackOption[];subtitleId:string};
export const emptyMediaTracks:MediaTracks={audio:[],audioId:'',subtitles:[],subtitleId:'off'};

// One controller belongs to one media connection. Track IDs never cross source changes.
export function createMediaTracks(video:HTMLVideoElement,changed:(value:MediaTracks)=>void,message:(value:string)=>void){
 const v=video as TrackVideo,cleanups:(()=>void)[]=[];
 let hls:Hls|undefined,local:TextTrack|null=null,choice:string|undefined,disposed=false,applying=false;
 const list=<T,>(value:ArrayLike<T>|undefined)=>value?Array.from(value):[];
 const caption=(track:TextTrack)=>track.kind==='subtitles'||track.kind==='captions';
 const label=(name:string|undefined,language:string|undefined,index:number,kind:string)=>[name?.trim(),language?.trim()].filter((value,index,all)=>value&&all.indexOf(value)===index).join(' · ')||kind+' '+(index+1);
 const nativeSubtitles=()=>list(v.textTracks).filter(track=>track!==local&&caption(track));
 const applyChoice=()=>{
  if(choice===undefined||applying)return;
  applying=true;
  try{
   // Disable the previous renderer before enabling a new one, avoiding doubled subtitles.
   if(hls){
    const index=choice.startsWith('hls:')?Number(choice.slice(4)):-1;
    if(hls.subtitleDisplay!==(index>=0))hls.subtitleDisplay=index>=0;
    if(hls.subtitleTrack!==index)hls.subtitleTrack=index;
   }
   if(!hls)nativeSubtitles().forEach((track,index)=>{const mode=choice==='native:'+index?'showing':'disabled';if(track.mode!==mode)track.mode=mode;});
   if(local){const mode=choice==='local'?'showing':'disabled';if(local.mode!==mode)local.mode=mode;}
  }finally{applying=false;}
 };
 const sync=()=>{
  if(disposed||applying)return;
  try{
   applyChoice();
   const audio=hls?hls.audioTracks.map((track,index)=>({id:'hls:'+index,label:label(track.name,track.lang,index,'音轨')})):list(v.audioTracks).map((track,index)=>({id:'native:'+index,label:label(track.label,track.language,index,'音轨')}));
   const audioIndex=hls?hls.audioTrack:list(v.audioTracks).findIndex(track=>track.enabled);
   const subtitles=hls?hls.subtitleTracks.map((track,index)=>({id:'hls:'+index,label:label(track.name,track.lang,index,'字幕')})):nativeSubtitles().map((track,index)=>({id:'native:'+index,label:label(track.label,track.language,index,'字幕')}));
   const index=hls?(hls.subtitleDisplay?hls.subtitleTrack:-1):nativeSubtitles().findIndex(track=>track.mode==='showing');
   const subtitleId=local?.mode==='showing'?'local':index>=0?(hls?'hls:':'native:')+index:'off';
   if(local)subtitles.push({id:'local',label:'本地字幕'});
   changed({audio,audioId:audioIndex>=0?(hls?'hls:':'native:')+audioIndex:'',subtitles,subtitleId});
  }catch{message('此浏览器未能读取媒体轨道，视频可继续播放');}
 };
 const listen=(target:TrackList<unknown>|HTMLVideoElement|undefined,name:string)=>{
  target?.addEventListener?.(name,sync);cleanups.push(()=>target?.removeEventListener?.(name,sync));
 };
 listen(v,'loadedmetadata');
 for(const target of [v.audioTracks,v.textTracks])for(const name of ['addtrack','removetrack','change'])listen(target,name);
 sync();
 return {
  attachHls(instance:Hls,events:(typeof Hls)['Events']){
   hls=instance;
   for(const event of [events.AUDIO_TRACKS_UPDATED,events.AUDIO_TRACK_SWITCHED,events.SUBTITLE_TRACKS_UPDATED,events.SUBTITLE_TRACKS_CLEARED,events.SUBTITLE_TRACK_SWITCH]){
    instance.on(event,sync);cleanups.push(()=>instance.off(event,sync));
   }
   sync();
  },
  setLocal(track:TextTrack|null){
   if(disposed)return;
   if(local&&local!==track)local.mode='disabled';
   local=track;
   // A media reconnect keeps the selected local file, but does not revive an explicit Off choice.
   if(track&&choice===undefined)choice=track.mode==='showing'?'local':'off';
   if(!track&&choice==='local')choice='off';
   sync();
  },
  selectSubtitle(id:string){
   if(disposed)return;
   const valid=id==='off'||id==='local'&&local||/^hls:\d+$/.test(id)&&hls?.subtitleTracks[Number(id.slice(4))]||/^native:\d+$/.test(id)&&!hls&&nativeSubtitles()[Number(id.slice(7))];
   if(!valid){sync();message('字幕轨道已变化，请重新选择');return;}
   const previous=choice;choice=id;
   try{applyChoice();sync();message(id==='off'?'字幕已关闭':id==='local'?'已切换为本地字幕':'已切换字幕轨道');}
   catch{choice=previous;sync();message('此浏览器无法切换该字幕轨道');}
  },
  selectAudio(id:string){
   if(disposed)return;
   try{
    if(/^hls:\d+$/.test(id)&&hls?.audioTracks[Number(id.slice(4))])hls.audioTrack=Number(id.slice(4));
    else if(/^native:\d+$/.test(id)&&!hls&&v.audioTracks?.[Number(id.slice(7))])list(v.audioTracks).forEach((track,index)=>{track.enabled=index===Number(id.slice(7));});
    else {sync();message('音轨已变化，请重新选择');return;}
    sync();message('已选择音轨，播放器正在切换');
   }catch{sync();message('此浏览器无法切换该音轨');}
  },
  destroy(){disposed=true;cleanups.splice(0).forEach(cleanup=>cleanup());}
 };
}
