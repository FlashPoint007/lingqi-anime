import {extractMedia,isMedia,mediaUrl,playerLinks} from './rule-api';
import {sourcePageError,type Rule} from './web-core';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
function discard(response:Response){void response.body?.cancel().catch(()=>{});}
export async function boundedText(response:Response,max=2*1024*1024,timeout=10000){
 if(!response.body)return '';if(Number(response.headers.get('content-length'))>max){discard(response);throw new Error('源站响应过大');}
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('源站响应过大');chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const charset=response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1]||'utf-8';try{return new TextDecoder(charset).decode(bytes);}catch{return new TextDecoder().decode(bytes);}
 })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('源站响应读取超时，请更换线路或重试')),timeout);})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export async function fetchPublic(url:string,init:RequestInit={},stream=false){
 let target=mediaUrl(url);for(let i=0;i<4;i++){
  // Streaming video must not be cut off by the connection/header timeout.
  const controller=stream?new AbortController():undefined;const timer=controller?setTimeout(()=>controller.abort(),12000):undefined;
  const deadline=controller?.signal||AbortSignal.timeout(12000),signal=init.signal?AbortSignal.any([deadline,init.signal]):deadline;
  let res:Response;try{res=await fetch(target.href,{...init,redirect:'manual',signal});}finally{if(timer)clearTimeout(timer);}
  if(res.status>=300&&res.status<400){const location=res.headers.get('location');discard(res);if(!location)throw new Error('源站重定向无地址');target=mediaUrl(location,target.href);continue;}return {res,url:target.href};
 }throw new Error('源站重定向过多');
}
export function mediaReferer(referer:string):Record<string,string>{return new URL(referer).hostname==='next.xifanacg.com'?{}:{Referer:referer};}
type MediaFailure={message:string;gone:boolean};
async function reachableMedia(url:string,referer:string,signal?:AbortSignal,failures?:Map<string,MediaFailure>){
 try{const {res}=await fetchPublic(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000),headers:{'User-Agent':UA,...mediaReferer(referer),...(/\.m3u8(?:[?#]|$)/i.test(url)?{}:{Range:'bytes=0-4095'}),Accept:'*/*'}});if(!res.ok){failures?.set(mediaUrl(url).href,{message:'源站视频文件响应 HTTP '+res.status+(res.status===404||res.status===410?'，该文件已失效':'，当前服务器无法读取'),gone:res.status===404||res.status===410});discard(res);return false;}
  if(/\.m3u8(?:[?#]|$)/i.test(url)){const text=await boundedText(res,1024*1024);return text.trimStart().startsWith('#EXTM3U');}
  const type=res.headers.get('content-type')||'';discard(res);return !/text\/html|json|javascript|xml/i.test(type);
 }catch{return false;}
}
// Xifan Next publishes episode-scoped media through its anonymous playback API.
// The key is the upstream public application key, also present in KazumiRules.
const XIFAN_PUBLIC_KEY='sb_publishable_OBIVAWACIX6lPXrO98_z24_HcsmalkA';
async function xifanMedia(page:string,signal?:AbortSignal){
 const u=new URL(page),ids=u.pathname.match(/^\/anime\/(\d+)\/play\/(\d+)\/?$/);
 if(u.hostname!=='next.xifanacg.com'||!ids)return null;
 const animeId=Number(ids[1]),episodeId=Number(ids[2]);
 const request=async(path:string,body:unknown)=>{
  const {res}=await fetchPublic('https://api.xifanacg.com/'+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:XIFAN_PUBLIC_KEY,Accept:'application/json'},body:JSON.stringify(body),signal});
  const text=await boundedText(res);let data:any;try{data=JSON.parse(text);}catch{throw new Error('稀饭播放接口未返回 JSON');}
  if(!res.ok||data.ok===false)throw new Error('稀饭播放接口：'+(data.message||data.error_code||res.status));return data;
 };
 const detail=await request('rest/v1/rpc/get_anime_detail',{p_id:String(animeId)});
 const sources=Array.isArray(detail.sources)?detail.sources:[];
 const code=u.searchParams.get('source');
 const source=sources.find((s:any)=>(!code||s.code===code)&&Array.isArray(s.episodes)&&s.episodes.some((e:any)=>e.id===episodeId));
 if(!source||!Number.isSafeInteger(source.id))throw new Error('稀饭当前线路没有所选剧集');
 const data=await request('functions/v1/issue-web-playback',{action:'fallback',episode_id:episodeId,source_id:source.id});
 if(data.episode_id!==episodeId||data.anime_id!==animeId)throw new Error('稀饭返回的视频与所选剧集不一致');
 const url=typeof data.url==='string'?mediaUrl(data.url).href:'';
 if(!url||!isMedia(url))throw new Error('稀饭没有返回可播放的视频地址');
 if(data.source_id!==undefined&&data.source_id!==source.id&&!data.candidates?.some((c:any)=>c.source_id===source.id&&c.url===data.url))throw new Error('稀饭返回的视频与所选线路不一致');
 return url;
}
export async function resolvePlayback(rule:Rule,page:string,declared?:string,parentSignal?:AbortSignal){
 const source=mediaUrl(page);if(source.origin!==new URL(rule.baseURL).origin)throw new Error('播放页面必须属于所选源站');
 const pending=[page],seen=new Set<string>();let directCandidate='',candidateReferer=page;const errors:string[]=[];const deadline=Date.now()+20000,signal=parentSignal?AbortSignal.any([parentSignal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
 const mediaFailures=new Map<string,MediaFailure>();
 const candidate=(url:string,referer:string)=>{if(!directCandidate||mediaFailures.get(directCandidate)?.gone){directCandidate=mediaUrl(url).href;candidateReferer=referer;}};
 // A passed API URL is accepted only by the route after finding it in upstream data.
 if(declared&&isMedia(declared)){candidate(declared,page);if(await reachableMedia(declared,page,signal,mediaFailures))return {media:directCandidate,referer:page,verified:true};}
 for(let depth=0;depth<4&&pending.length;depth++){
  if(Date.now()>deadline||signal.aborted)break;
  const next=pending.shift()!;if(seen.has(next))continue;seen.add(next);
  try{
   if(isMedia(next)){candidate(next,page);if(await reachableMedia(next,page,signal,mediaFailures))return {media:mediaUrl(next).href,referer:page,verified:true};continue;}
   const dynamic=await xifanMedia(next,signal);if(dynamic){candidate(dynamic,next);if(await reachableMedia(dynamic,next,signal,mediaFailures))return {media:dynamic,referer:next,verified:true};continue;}
   const {res,url}=await fetchPublic(next,{signal,headers:{'User-Agent':String(rule.userAgent||UA),Accept:'text/html,application/json','Referer':String(rule.referer||page)}});
   if(!res.ok){discard(res);throw new Error(res.status===404?'源站播放页不存在（404），该条目或线路可能已失效':'源站响应 '+res.status);}const html=await boundedText(res);
   const pageError=sourcePageError(html);if(pageError)throw new Error(pageError);
   for(const media of extractMedia(html,url).slice(0,3)){if(signal.aborted)break;candidate(media,url);if(await reachableMedia(media,url,signal,mediaFailures))return {media,referer:url,verified:true};}
   const links=playerLinks(html,url).filter(link=>!isMedia(link));
   // Only follow declared player links, never arbitrary links or page scripts.
   for(const link of links){if(/(?:comment|ads?|analytics|google)/i.test(new URL(link).pathname))continue;if(pending.length<3)pending.push(link);}
  }catch(e){errors.push((e as Error).message);}
 }
 const failure=mediaFailures.get(directCandidate);
 return {media:failure?.gone?'':directCandidate,verified:false,referer:candidateReferer,reason:signal.aborted?'播放解析超时或已取消，请重试或切换视频源':failure?.message||errors[0]||'此线路未解析到可播放的视频地址，请切换线路或视频源'};
}

export type Ticket={url:string;referer:string;expires:number};
function secret(){const value=process.env.LINGQI_MEDIA_SECRET;if(!value)throw new Error('站内媒体服务未配置');return value;}
function base64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('无效媒体授权');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
let signingKey:Promise<CryptoKey>|undefined;
async function key(){return signingKey??=crypto.subtle.importKey('raw',new TextEncoder().encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signedMediaUrl(url:string,referer:string,expires=Date.now()+8*3600000){
 const ticket:Ticket={url:mediaUrl(url).href,referer:mediaUrl(referer).href,expires},bytes=new TextEncoder().encode(JSON.stringify(ticket));if(bytes.length>10000)throw new Error('媒体地址过长，请更换线路');const payload=base64url(bytes);
 const signature=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),new TextEncoder().encode(payload))));
 return '/api/media?ticket='+payload+'.'+signature;
}
export async function readTicket(raw:string):Promise<Ticket>{
 if(raw.length>14000)throw new Error('媒体授权过长');const parts=raw.split('.');if(parts.length!==2)throw new Error('无效媒体授权');
 if(!await crypto.subtle.verify('HMAC',await key(),unbase64(parts[1]),new TextEncoder().encode(parts[0])))throw new Error('媒体授权不匹配');
 const data=JSON.parse(new TextDecoder().decode(unbase64(parts[0]))) as Ticket;
 if(!Number.isFinite(data.expires)||data.expires<Date.now()||data.expires>Date.now()+8*3600000+60000)throw new Error('媒体授权已过期，请重新点击剧集');mediaUrl(data.url);mediaUrl(data.referer);return data;
}
export async function proxyMedia(req:Request){
 let ticket:Ticket;try{ticket=await readTicket(new URL(req.url).searchParams.get('ticket')||'');}catch(e){return Response.json({error:(e as Error).message},{status:403});}
 const headers:Record<string,string>={'User-Agent':UA,...mediaReferer(ticket.referer),Accept:'*/*'};const range=req.headers.get('range');if(range){const match=range.match(/^bytes=(\d{0,16})-(\d{0,16})$/);if(!match||!match[1]&&!match[2]||[match[1],match[2]].some(n=>n&&!Number.isSafeInteger(Number(n)))||match[1]&&match[2]&&Number(match[1])>Number(match[2])||!match[1]&&Number(match[2])===0)return new Response('Invalid range',{status:416});headers.Range=range;}
 try{
  const {res,url}=await fetchPublic(ticket.url,{headers,method:req.method==='HEAD'?'HEAD':'GET',signal:req.signal},true);if(!res.ok){discard(res);return new Response('当前视频线路响应 '+res.status,{status:res.status===416?416:502,headers:res.status===416&&res.headers.has('content-range')?{'Content-Range':res.headers.get('content-range')!}:{}});}
  const type=res.headers.get('content-type')||'';const playlist=isMedia(url)&&/\.m3u8(?:[?#]|$)/i.test(url)||/mpegurl/i.test(type);
  const output=new Headers({'Cache-Control':'private, max-age=30','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
  if(playlist&&req.method!=='HEAD'){
   const body=await boundedText(res,1024*1024);if(!body.trimStart().startsWith('#EXTM3U'))throw new Error('源站没有返回 HLS 播放列表');
   const lines=body.split(/\r?\n/).map(line=>line.trim());let references=0;
   for(const line of lines){references+=line&&!line.startsWith('#')?1:[...line.matchAll(/URI="([^"]+)"/g)].length;if(lines.length>20000||references>4096)throw new Error('播放列表过大，请更换线路');}
   const replace=async(input:string)=>new URL(await signedMediaUrl(new URL(input,url).href,ticket.referer,ticket.expires),req.url).href;
   let size=0;
   // Keep cryptographic work and rewritten output bounded even for hostile lists.
   for(let at=0;at<lines.length;at+=16){req.signal.throwIfAborted();const batch=await Promise.all(lines.slice(at,at+16).map(async line=>{if(line&&!line.startsWith('#'))return replace(line);const matches=[...line.matchAll(/URI="([^"]+)"/g)];for(const m of matches)line=line.replace(m[0],'URI="'+await replace(m[1])+'"');return line;}));for(const line of batch){size+=new TextEncoder().encode(line).length+1;if(size>4*1024*1024)throw new Error('播放列表过大，请更换线路');}lines.splice(at,batch.length,...batch);}
   output.set('Content-Type','application/vnd.apple.mpegurl');return new Response(lines.join('\n'),{headers:output});
  }
  if(/text\/html|json|javascript|xml/i.test(type)){discard(res);throw new Error('源站返回了网页，无法作为视频播放');}
  for(const h of ['content-type','content-length','content-range','accept-ranges']){const value=res.headers.get(h);if(value)output.set(h,value);}if(!output.has('Content-Type'))output.set('Content-Type','application/octet-stream');
  if(req.method==='HEAD')discard(res);return new Response(req.method==='HEAD'?null:res.body,{status:res.status,headers:output});
 }catch(e){return Response.json({error:(e as Error).message},{status:502});}
}
