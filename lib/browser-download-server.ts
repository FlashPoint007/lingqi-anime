import {boundedText,fetchPublic,mediaReferer,readTicket,signedMediaUrl,type Ticket} from './playback-server';
import {isMedia,mediaUrl} from './rule-api';
import {parseOfflinePlaylist} from './offline-hls';
import {readRequestText,RequestLimitError} from './request-guard';
import {zipStream,type ZipEntry} from './download-zip';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
const encoder=new TextEncoder(),MAX_BUNDLE=2*1024*1024*1024;
const discard=(res:Response)=>{void res.body?.cancel().catch(()=>{});};
const errorResponse=(error:unknown,status=502)=>Response.json({error:error instanceof Error?error.message:'下载失败，请更换线路重试'},{status,headers:{'Cache-Control':'no-store'}});
function basename(input:unknown){const name=Array.from(String(input||'零柒番剧').normalize('NFC').replace(/[\uD800-\uDFFF]/gu,'_').replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'')).slice(0,100).join('')||'零柒番剧';return /^(?:con|aux|prn|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?'_'+name:name;}
function disposition(name:string,extension:string){const encoded=encodeURIComponent(basename(name)+'.'+extension).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());return 'attachment; filename="lingqi.'+extension+'"; filename*=UTF-8\'\''+encoded;}
function headers(ticket:Ticket){return {'User-Agent':UA,...mediaReferer(ticket.referer),Accept:'*/*','Accept-Encoding':'identity'};}
function isPlaylist(res:Response,url:string,hint=false){return hint||/\.m3u8(?:[?#]|$)/i.test(url)||/mpegurl/i.test(res.headers.get('content-type')||'');}
function validMedia(res:Response,rangeRequested=false){
 if(!res.ok){discard(res);throw new Error('源站下载响应 HTTP '+res.status+'，请重新解析或更换线路');}
 const type=res.headers.get('content-type')||'';
 if(/text\/(?:html|plain)|json|javascript|xml|image\//i.test(type)){discard(res);throw new Error('源站没有返回视频文件，请更换线路');}
 const raw=res.headers.get('content-length'),length=raw===null?undefined:Number(raw);
 if(length!==undefined&&(!/^\d+$/.test(raw!)||!Number.isSafeInteger(length)||length<=0)){discard(res);throw new Error('源站返回了空文件或无效长度');}
 if(res.status===206){const match=res.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/),numbers=match?.slice(1).map(Number);if(!numbers||numbers.some(n=>!Number.isSafeInteger(n))||numbers[0]>numbers[1]||numbers[1]>=numbers[2]||length!==undefined&&length!==numbers[1]-numbers[0]+1||!rangeRequested&&(numbers[0]!==0||numbers[1]+1!==numbers[2])){discard(res);throw new Error('源站只返回了部分视频或无效的下载范围，请更换线路');}return length??numbers[1]-numbers[0]+1;}
 return length;
}
async function* mediaBytes(res:Response,signal:AbortSignal,expected?:number){
 const reader=res.body?.getReader();if(!reader)throw new Error('源站返回了空文件');let received=0;
 try{while(true){signal.throwIfAborted();let timer:ReturnType<typeof setTimeout>|undefined;
   const aborted=()=>{void reader.cancel(signal.reason).catch(()=>{});};signal.addEventListener('abort',aborted,{once:true});
   let part:ReadableStreamReadResult<Uint8Array>;try{part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('下载读取超时，请重新下载')),30000);})]);}finally{clearTimeout(timer);signal.removeEventListener('abort',aborted);}
   signal.throwIfAborted();if(part.done)break;received+=part.value.length;if(expected!==undefined&&received>expected)throw new Error('视频长度与源站声明不一致');yield part.value;
  }if(!received||expected!==undefined&&received!==expected)throw new Error('视频未完整下载，请重试');
 }finally{void reader.cancel().catch(()=>{});}
}
type Bundle={text:string;resources:Map<string,string>};
async function hlsBundle(ticket:Ticket,signal:AbortSignal,initial?:{res:Response;url:string}):Promise<Bundle>{
 let current=initial||await fetchPublic(ticket.url,{headers:headers(ticket),signal},true);const seen=new Set<string>();
 for(let depth=0;depth<4;depth++){
  if(!current.res.ok){discard(current.res);throw new Error('HLS 播放列表响应 HTTP '+current.res.status);}
  if(seen.has(current.url)){discard(current.res);throw new Error('HLS 清晰度列表循环引用');}seen.add(current.url);
  const resources=new Map<string,string>(),text=await boundedText(current.res,4*1024*1024);
  const parsed=parseOfflinePlaylist(text,current.url,url=>{const address=mediaUrl(url).href;let name=resources.get(address);if(!name){const extension=new URL(address).pathname.match(/\.(ts|m4s|mp4|aac|mp3|vtt|webvtt)$/i)?.[1]?.toLowerCase()||'bin';name='resources/'+String(resources.size+1).padStart(5,'0')+'.'+extension;resources.set(address,name);}return name;});
  if(!parsed.variant)return {text:parsed.text,resources};
  if(depth===3)throw new Error('HLS 清晰度嵌套过深，请选择其他线路');
  current=await fetchPublic(parsed.variant,{headers:headers(ticket),signal},true);
 }throw new Error('HLS 播放列表无效');
}
async function ticketFromInput(req:Request,input:unknown){
 if(typeof input!=='string'||input.length>16000)throw new Error('下载地址无效');const url=new URL(input,req.url);
 if(url.origin===new URL(req.url).origin){if(url.pathname!=='/api/media')throw new Error('下载地址无效');return readTicket(url.searchParams.get('ticket')||'');}
 const publicMedia=mediaUrl(url.href);if(!isMedia(publicMedia.href))throw new Error('仅支持 MP4、WebM 或 HLS 视频直链');
 return {url:publicMedia.href,referer:publicMedia.origin+'/',expires:Date.now()+8*3600000};
}
export async function prepareBrowserDownload(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return errorResponse(new Error('跨站请求被拒绝'),403);
 try{
  const body=JSON.parse(await readRequestText(req,24000)),ticket=await ticketFromInput(req,body.url),hint=body.mediaType==='hls',signal=AbortSignal.any([req.signal,AbortSignal.timeout(25000)]);
  const current=await fetchPublic(ticket.url,{headers:{...headers(ticket),...(!hint&&!/\.m3u8(?:[?#]|$)/i.test(ticket.url)?{Range:'bytes=0-4095'}:{})},signal},true);
  const bundle=isPlaylist(current.res,current.url,hint);
  if(bundle)await hlsBundle(ticket,signal,current);else{validMedia(current.res,true);discard(current.res);}
  const signed=new URL(await signedMediaUrl(ticket.url,ticket.referer,ticket.expires),req.url),params=new URLSearchParams({ticket:signed.searchParams.get('ticket')!,name:basename(body.name),...(bundle?{format:'hls'}:{})});
  const extension=bundle?'zip':/webm/i.test(current.res.headers.get('content-type')||'')||/\.webm(?:[?#]|$)/i.test(current.url)?'webm':'mp4';
  return Response.json({url:'/api/download?'+params,format:extension,filename:basename(body.name)+'.'+extension},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return errorResponse(error,error instanceof RequestLimitError?error.status:400);}
}
export async function browserDownload(req:Request){
 const url=new URL(req.url);let ticket:Ticket;try{ticket=await readTicket(url.searchParams.get('ticket')||'');}catch(error){return errorResponse(error,403);}
 try{
  const range=req.headers.get('range');if(range){const match=range.match(/^bytes=(\d{0,16})-(\d{0,16})$/);if(!match||!match[1]&&!match[2]||[match[1],match[2]].some(n=>n&&!Number.isSafeInteger(Number(n)))||match[1]&&match[2]&&Number(match[1])>Number(match[2])||!match[1]&&Number(match[2])===0)return errorResponse(new Error('无效的下载范围'),416);}
  const abort=new AbortController(),signal=AbortSignal.any([req.signal,abort.signal]);
  const hint=url.searchParams.get('format')==='hls';
  const current=await fetchPublic(ticket.url,{headers:{...headers(ticket),...(!hint&&range?{Range:range}:{}),...(!hint&&req.headers.get('if-range')?{'If-Range':req.headers.get('if-range')!.slice(0,256)}:{})},signal,method:req.method==='HEAD'?'HEAD':'GET'},true);
  const output=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
  if(isPlaylist(current.res,current.url,hint)){
   if(!current.res.ok){discard(current.res);throw new Error('HLS 播放列表响应 HTTP '+current.res.status);}
   if(range){discard(current.res);return errorResponse(new Error('HLS 文件包暂不支持续传，请重新下载'),416);}
   output.set('Content-Type','application/zip');output.set('Content-Disposition',disposition(url.searchParams.get('name')||'','zip'));output.set('Accept-Ranges','none');
   if(req.method==='HEAD'){discard(current.res);return new Response(null,{headers:output});}
   const bundle=await hlsBundle(ticket,signal,current);let total=0;
   const literal=(name:string,text:string):ZipEntry=>({name,open:async function*(){signal.throwIfAborted();yield encoder.encode(text);}});
   const entries:ZipEntry[]=[literal('playlist.m3u8',bundle.text),literal('README.txt','零柒番剧 · 本地视频文件包\n\n解压整个文件夹，用支持 HLS 的本地播放器（例如 VLC）打开 playlist.m3u8。\n请保留 resources 文件夹，里面是完整的视频分片；无需连接源站。\n此文件包不是 MP4，不是加密或直播流。下载中断后请重新下载。\n')];
   for(const [address,name]of bundle.resources)entries.push({name,open:async function*(){signal.throwIfAborted();const {res}=await fetchPublic(address,{headers:headers(ticket),signal},true);const expected=validMedia(res);if(expected!==undefined&&expected>MAX_BUNDLE-total){discard(res);throw new Error('HLS 文件包超过 2 GB');}for await(const bytes of mediaBytes(res,signal,expected)){total+=bytes.length;if(total>MAX_BUNDLE)throw new Error('HLS 文件包超过 2 GB');yield bytes;}}});
   return new Response(zipStream(entries,abort),{headers:output});
  }
  if(current.res.status===416){const contentRange=current.res.headers.get('content-range');discard(current.res);return new Response(null,{status:416,headers:contentRange?{'Content-Range':contentRange}:{}});}
  const expected=validMedia(current.res,!!range),extension=/webm/i.test(current.res.headers.get('content-type')||'')||/\.webm(?:[?#]|$)/i.test(current.url)?'webm':'mp4';
  output.set('Content-Type',extension==='webm'?'video/webm':'video/mp4');output.set('Content-Disposition',disposition(url.searchParams.get('name')||'',extension));
  for(const name of ['content-length','content-range','accept-ranges','etag','last-modified']){const value=current.res.headers.get(name);if(value)output.set(name,value);}
  if(req.method==='HEAD'){discard(current.res);return new Response(null,{status:current.res.status,headers:output});}
  const iterator=mediaBytes(current.res,signal,expected),body=new ReadableStream<Uint8Array>({async pull(controller){try{const {value,done}=await iterator.next();if(done)controller.close();else controller.enqueue(value);}catch(error){abort.abort(error);controller.error(error);}},async cancel(reason){abort.abort(reason);await iterator.return(undefined);}});
  return new Response(body,{status:current.res.status,headers:output});
 }catch(error){return errorResponse(error);}
}
