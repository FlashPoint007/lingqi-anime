// Self-contained, local-only renderer. Never fetch an API during offline playback.
const sources=['bilibili','gamer','dandan','local','site'];
export function parseOfflineDanmaku(value){
 if(!value||value.version!==1||!['saved','empty','unavailable'].includes(value.status)||!Array.isArray(value.comments)||value.comments.length>2400||JSON.stringify(value).length>250000)return;
 if(!Number.isFinite(value.savedAt)||value.savedAt<0)return;
 const comments=value.comments.filter(row=>Array.isArray(row)&&row.length===5&&Number.isFinite(row[0])&&row[0]>=0&&row[0]<=86400&&[1,4,5].includes(row[1])&&Number.isSafeInteger(row[2])&&row[2]>=0&&row[2]<=0xffffff&&typeof row[3]==='string'&&row[3].length>0&&row[3].length<=180&&sources.includes(row[4])).map(row=>[...row]).sort((a,b)=>a[0]-b[0]);
 if(comments.length!==value.comments.length)return;
 const clamp=(n,lo,hi,fallback)=>Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):fallback;
 return {version:1,status:comments.length?'saved':value.status==='saved'?'empty':value.status,comments,total:Math.max(comments.length,Math.floor(clamp(value.total,0,10000000,comments.length))),sampled:value.sampled===true,source:typeof value.source==='string'?value.source.slice(0,180):'',notes:Array.isArray(value.notes)?value.notes.filter(n=>typeof n==='string').slice(0,3).map(n=>n.slice(0,220)):[],savedAt:value.savedAt,style:{opacity:clamp(value.style?.opacity,.2,1,.85),fontSize:clamp(value.style?.fontSize,16,36,22),area:clamp(value.style?.area,.25,1,.5),speed:clamp(value.style?.speed,.5,2,1)}};
}
export function offlineDanmakuLabel(raw){const value=parseOfflineDanmaku(raw);return value?value.status==='saved'?'离线弹幕 '+value.comments.length+' 条'+(value.sampled?'（精简快照）':''):value.status==='empty'?'这一集暂无弹幕':'弹幕未保存，可联网补存或导入':'未保存弹幕，可联网补存或导入';}
export function importOfflineDanmaku(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>5*1024*1024)throw Error('请选择不超过 5 MB 的 XML / JSON 弹幕文件');
 const comments=[],add=(time,mode,color,body)=>{time=Number(time);mode=Number(mode);color=Number(color);if(typeof body!=='string')return;body=body.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,180);if(Number.isFinite(time)&&time>=0&&time<=86400&&[1,4,5].includes(mode)&&body)comments.push([Math.round(time*1000)/1000,mode,Number.isSafeInteger(color)&&color>=0&&color<=0xffffff?color:0xffffff,body,'local']);};
 if(text.trimStart().startsWith('<')){
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||!/<i(?:\s[^>]*)?>[\s\S]*<\/i>\s*$/.test(text))throw Error('不是有效的 BiliBili XML 弹幕');
  const decode=value=>value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(whole,key)=>{if(key[0]==='#'){const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key]??whole;});
  const re=/<d\s+p=["']([^"']{1,300})["'][^>]*>([^<]*)<\/d>/g;let match;while((match=re.exec(text))&&comments.length<50000){const p=match[1].split(',');add(p[0],p[1],p[3],decode(match[2]));}
 }else{
  let value;try{value=JSON.parse(text);}catch{throw Error('请选择 BiliBili XML 或弹弹play JSON 弹幕');}const list=Array.isArray(value)?value:value?.comments;if(!Array.isArray(list))throw Error('弹幕 JSON 格式不正确');
  for(const row of list.slice(0,50000)){if(Array.isArray(row)){add(row[0],row[1],row[2],row[3]);continue;}if(typeof row?.p!=='string')continue;const p=row.p.split(',');add(p[0],p[1],p[2],row.m);}
 }
 if(!comments.length)throw Error('文件中没有可显示的弹幕');
 comments.sort((a,b)=>a[0]-b[0]);const seen=new Set(),unique=comments.filter(row=>{const id=Math.round(row[0]*2)+':'+row[1]+':'+row[3];if(seen.has(id))return false;seen.add(id);return true;});let count=Math.min(2400,unique.length),rows;
 do{rows=count>=unique.length?unique:Array.from({length:count},(_,n)=>unique[Math.floor(n*(unique.length-1)/Math.max(1,count-1))]);if(new TextEncoder().encode(JSON.stringify(rows)).length<=170000)break;count=Math.floor(count*.8);}while(count>0);
 return {version:1,status:'saved',comments:rows,total:comments.length,sampled:rows.length<unique.length,source:'本地导入',notes:[],savedAt:Date.now(),style:{opacity:.85,fontSize:22,area:.5,speed:1}};
}
export function createOfflineDanmakuRenderer(video,canvas){
 const context=canvas.getContext?.('2d');let data,enabled=true,frame=0,width=1,height=1,rows=[],last=-Infinity,disposed=false;
 const clear=()=>{context?.clearRect(0,0,width,height);canvas.dataset.active='0';};
 const draw=()=>{if(!context)return;const time=video.currentTime;if(time===last)return;last=time;clear();if(!enabled||!data||video.readyState<2||video.seeking)return;
  context.font=`600 ${data.style.fontSize}px system-ui, sans-serif`;context.globalAlpha=data.style.opacity;context.lineWidth=3;context.strokeStyle='#000c';context.lineJoin='round';
  let count=0;for(const row of rows){if(row.start>time)break;if(row.end<=time)continue;const x=row.comment[1]===1?width-(time-row.start)*row.velocity:(width-row.width)/2;context.fillStyle='#'+row.comment[2].toString(16).padStart(6,'0');context.strokeText(row.comment[3],x,row.y,width*2);context.fillText(row.comment[3],x,row.y,width*2);count++;}canvas.dataset.active=String(count);
 };
 const resize=()=>{if(!context)return;const rect=video.getBoundingClientRect(),aspect=video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:rect.width/Math.max(1,rect.height);width=Math.max(1,Math.min(rect.width,rect.height*aspect));height=Math.max(1,Math.min(rect.height,rect.width/aspect));const ratio=Math.min(2,window.devicePixelRatio||1);canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.style.left=(rect.width-width)/2+'px';canvas.style.top=(rect.height-height)/2+'px';canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);rows=[];
  if(data){context.font=`600 ${data.style.fontSize}px system-ui, sans-serif`;const line=Math.ceil(data.style.fontSize*1.5),lanes=Math.max(1,Math.min(24,Math.floor(height*data.style.area/line))),previous=Array(lanes),duration=8/data.style.speed;
   for(const comment of data.comments){const size=Math.min(width*2,context.measureText(comment[3]).width),velocity=(width+size)/duration,start=comment[0],end=start+duration;let lane;
    for(let n=0;n<lanes;n++){const at=comment[1]===4?lanes-1-n:n,p=previous[at];if(!p||p.end<=start||comment[1]===1&&p.comment[1]===1&&start>=Math.max(p.start+(p.width+16)/p.velocity,p.end-(width-16)/velocity)){lane=at;break;}}
    if(lane===undefined)continue;const row={comment,start,end,width:size,velocity,y:Math.round(line*(lane+.75))};previous[lane]=row;rows.push(row);
   }
  }canvas.dataset.count=String(data?.comments.length||0);last=-Infinity;draw();
 };
 const tick=()=>{frame=0;if(disposed)return;draw();if(enabled&&data?.comments.length&&!video.paused&&!video.ended&&!document.hidden)frame=requestAnimationFrame(tick);};
 const wake=()=>{last=-Infinity;if(!frame)tick();};
 const events=['play','pause','timeupdate','seeked','seeking','ratechange','loadeddata','emptied'];for(const event of events)video.addEventListener(event,wake);video.addEventListener('resize',resize);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',wake);const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):undefined;observer?.observe(video);
 return {set(value){data=parseOfflineDanmaku(value);resize();wake();},toggle(value){enabled=value;canvas.hidden=!enabled;last=-Infinity;clear();wake();},destroy(){disposed=true;cancelAnimationFrame(frame);observer?.disconnect();for(const event of events)video.removeEventListener(event,wake);video.removeEventListener('resize',resize);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',wake);clear();}};
}
