export type ImageMatch={id:number;title:string;displayTitle:string;alternate:string;episode:string;from:number;to:number;similarity:number};
const text=(value:unknown)=>typeof value==='string'?value.trim().slice(0,200):'';
export function imageMatches(value:any):ImageMatch[]{
 if(!value||!Array.isArray(value.result))throw Error('识别服务返回的数据格式不正确，请稍后重试');
 const matches:ImageMatch[]=[];
 for(const row of value.result.slice(0,100)){
  const anime=row?.anilist;if(!anime||!Number.isSafeInteger(anime.id)||anime.id<1||anime.id>2147483647||anime.isAdult!==false)continue;
  const title=text(anime.title?.native)||text(anime.title?.romaji)||text(anime.title?.english);if(!title)continue;
  if(!Number.isFinite(row.similarity)||row.similarity<=0||row.similarity>1||!Number.isFinite(row.from)||!Number.isFinite(row.to)||row.from<0||row.to<row.from||row.to>86400)continue;
  const episode=typeof row.episode==='number'&&Number.isFinite(row.episode)&&row.episode>=0&&row.episode<=100000?String(row.episode):text(row.episode).slice(0,40);
  matches.push({id:anime.id,title,displayTitle:text(anime.title?.chinese)||title,alternate:text(anime.title?.romaji)||text(anime.title?.english),episode,from:row.from,to:row.to,similarity:row.similarity});
 }
 matches.sort((a,b)=>b.similarity-a.similarity);const unique=new Set<string>();return matches.filter(m=>{const key=m.id+':'+m.episode;if(unique.has(key))return false;unique.add(key);return true;}).slice(0,8);
}
export function imageFile(file:Blob){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片');if(!file.size||file.size>5*1024*1024)throw Error('请选择不超过 5 MB 的图片');}
const check=(signal:AbortSignal)=>{if(signal.aborted)throw signal.reason||new DOMException('已停止识别','AbortError');};
// Canvas export strips file names and metadata. No image leaves this browser here.
export async function resizeScreenshot(file:File,signal:AbortSignal){
 imageFile(file);check(signal);const address=URL.createObjectURL(file),picture=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);picture.onload=picture.onerror=null;error?reject(error):resolve();};const cancel=()=>{picture.src='';finish(new DOMException('已停止识别','AbortError'));};signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{picture.src='';finish(Error('图片读取超时，请更换图片'));},10000);picture.onload=()=>finish();picture.onerror=()=>finish(Error('这张图片无法读取，请更换有效图片'));picture.src=address;});
  check(signal);const width=picture.naturalWidth,height=picture.naturalHeight;if(!width||!height||width>12000||height>12000||width*height>32000000)throw Error('图片分辨率过大，请先裁切动画画面');
  const scale=Math.min(1,1280/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');if(!context)throw Error('当前浏览器无法处理图片');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(picture,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('图片处理超时，请重试')),10000);canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(Error('图片处理失败，请更换图片'));},'image/jpeg',.85);});check(signal);if(blob.type!=='image/jpeg'||blob.size>1024*1024)throw Error('图片处理后仍过大，请先缩小或裁切');return blob;
 }finally{URL.revokeObjectURL(address);picture.src='';}
}
export async function searchScreenshot(blob:Blob,signal:AbortSignal):Promise<ImageMatch[]>{
 check(signal);if(blob.type!=='image/jpeg'||!blob.size||blob.size>1024*1024)throw Error('请先选择并处理有效图片');
 const form=new FormData();form.append('image',blob,'screenshot.jpg');let response:Response;
 try{response=await fetch('https://api.trace.moe/search?anilistInfo=2',{method:'POST',body:form,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});}catch(error){check(signal);throw Error('无法连接图片识别服务，请检查网络后重试');}
 if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error(response.status===402?'识别服务配额已用完或有其他识别正在进行，请稍后再试':response.status===429?'识别请求较多，请稍后再试':response.status===413?'图片过大，请裁切后重试':'图片识别服务暂时不可用，请稍后再试');}
 const reader=response.body?.getReader();if(!reader)throw Error('识别服务没有返回数据');const parts:Uint8Array[]=[];let size=0;
 try{while(true){check(signal);const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw Error('识别结果过大，请更换图片重试');parts.push(value);}}finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('识别服务没有返回有效结果，请稍后重试');}check(signal);if(result?.error)throw Error('暂时无法识别这张图片，请使用清晰的动画原始画面重试');return imageMatches(result);
}
export function sceneTime(seconds:number){const n=Math.floor(seconds);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
