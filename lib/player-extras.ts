// Local-only browser equivalents of Kazumi's subtitle, screenshot and sleep tools.
export function subtitleVtt(input:string){
 if(new TextEncoder().encode(input).length>2*1024*1024)throw Error('请选择不超过 2 MB 的 VTT / SRT 字幕');
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(/^WEBVTT(?:[ \t]|\n|$)/.test(text))return text+'\n';
 const blocks=text.split(/\n[ \t]*\n/),cues:string[]=[];
 const stamp=(h:string,m:string,s:string,ms:string)=>{if(Number(m)>59||Number(s)>59)throw Error('SRT 字幕时间格式不正确');return {text:h.padStart(2,'0')+':'+m+':'+s+'.'+ms,time:((Number(h)*60+Number(m))*60+Number(s))*1000+Number(ms)};};
 if(blocks.length>10000)throw Error('字幕条数过多，请选择较小的字幕文件');
 for(const block of blocks){
  const lines=block.split('\n');if(/^\d+$/.test(lines[0].trim()))lines.shift();
  const match=lines.shift()?.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if(!match||!lines.length)throw Error('请选择有效的 VTT / SRT 字幕');
  const start=stamp(...match.slice(1,5) as [string,string,string,string]),end=stamp(...match.slice(5,9) as [string,string,string,string]);
  if(end.time<=start.time)throw Error('SRT 字幕结束时间必须晚于开始时间');
  // Unsupported SRT formatting is removed; cue text is never injected into HTML.
  const body=lines.join('\n').replace(/<[^>\n]*>/g,'').replace(/-->/g,'→');
  cues.push(start.text+' --> '+end.text+'\n'+body);
 }
 return 'WEBVTT\n\n'+cues.join('\n\n')+'\n';
}

export function createPlaybackTimer(onExpire:()=>void,clock:()=>number=Date.now){
 let deadline=0,endEpisode=false,expired=false;
 const cancel=()=>{deadline=0;endEpisode=false;expired=false;};
 return {
  set(value:number|'episode'){cancel();if(value==='episode')endEpisode=true;else if(Number.isFinite(value)&&value>0&&value<=180)deadline=clock()+value*60000;},
  cancel,resume(){expired=false;},
  // Absolute time remains correct after a background tab throttles its timers.
  mayPlay(ended=false){if(!expired&&(deadline>0&&clock()>=deadline||ended&&endEpisode)){deadline=0;endEpisode=false;expired=true;onExpire();}return !expired;},
  get blocked(){return expired;},get remaining(){return deadline?Math.max(0,Math.ceil((deadline-clock())/1000)):0;}
 };
}

export async function captureVideoFrame(video:HTMLVideoElement){
 if(video.seeking)throw Error('画面正在跳转，请等待完成后再截图');
 if(video.readyState<2||!video.videoWidth||!video.videoHeight)throw Error('视频画面加载完成后才能截图');
 const scale=Math.min(1,3840/video.videoWidth,2160/video.videoHeight),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
 const context=canvas.getContext('2d');if(!context)throw Error('当前浏览器不支持截图');
 try{context.drawImage(video,0,0,canvas.width,canvas.height);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('截图生成失败，请重试')),'image/png'));}
 catch(error){if(error instanceof Error&&error.name==='SecurityError')throw Error('浏览器禁止读取此线路的画面，无法截图；视频可继续正常观看');throw error;}
}
