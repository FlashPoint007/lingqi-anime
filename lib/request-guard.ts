type DB=Pick<D1Database,'prepare'>;
type Group='page'|'metadata'|'source'|'resolve'|'media'|'download'|'rules'|'personal'|'auth';
const limits:Record<Group,{limit:number;block:number;parallel:number;clientParallel:number}>={download:{limit:20,block:1,parallel:12,clientParallel:2},auth:{limit:10,block:1,parallel:4,clientParallel:1},page:{limit:300,block:10,parallel:48,clientParallel:16},metadata:{limit:180,block:10,parallel:48,clientParallel:16},source:{limit:180,block:10,parallel:24,clientParallel:8},resolve:{limit:30,block:3,parallel:8,clientParallel:3},media:{limit:1200,block:30,parallel:80,clientParallel:20},rules:{limit:40,block:5,parallel:16,clientParallel:8},personal:{limit:120,block:5,parallel:16,clientParallel:4}};
type Bucket={window:number;remaining:number;blocked:boolean;localAllocated?:boolean};
const locks=new Map<string,Promise<void>>();
const buckets=new Map<string,Bucket>(),active=new Map<string,number>(),globalActive=new Map<Group,number>();let cleanupAt=0;
export class RequestLimitError extends Error{constructor(message:string,public status:number){super(message);}}
export async function readRequestText(req:Request,max=65536){
 const length=req.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>max))throw new RequestLimitError('请求过大',413);
 if(!req.body)return '';const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new RequestLimitError('请求过大',413);parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RequestLimitError('请求读取超时',408)),8000);})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
function reject(message:string,status:number,retry=0){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store',...(retry?{'Retry-After':String(retry)}:{})}});}
function group(req:Request):Group{const path=new URL(req.url).pathname;if(path==='/api/auth')return 'auth';if(path==='/api/library'||path==='/api/discussions'&&req.method==='POST')return 'personal';if(path==='/api/download')return req.method==='POST'?'resolve':'download';if(path==='/api/media')return 'media';if(path==='/api/source')return 'source';if(path==='/api/rules')return 'rules';return path.startsWith('/api/')?'metadata':'page';}
async function identity(req:Request,secret?:string,trustedEdge=false,accountBound=false){
 // Dispatch can reconstruct Request and omit `cf`. Only the Cloudflare Worker
 // entrypoint may opt into trusting the edge-provided connecting-IP header.
 const account=trustedEdge&&accountBound?req.headers.get('oai-authenticated-user-id'):null;
 const ip=trustedEdge||(req as Request & {cf?:unknown}).cf?req.headers.get('cf-connecting-ip'):null;
 if(!secret)return 'shared';let input:string;
 if(account&&account.length<=512)input='account:'+account;
 else if(ip&&ip.length<=64&&/^([\d.]+|[\da-f:]+)$/i.test(ip))input='rate:'+ip;
 else return 'shared';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(input));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function reserveUnlocked(key:string,g:Group,shared:boolean,db?:DB){
 const now=Date.now(),window=Math.floor(now/60000)*60000,config=limits[g],limit=config.limit*(shared?8:1);let bucket=buckets.get(key);
 if(!bucket){
  if(buckets.size>=5000){for(const [k,v] of buckets)if(v.window<window)buckets.delete(k);if(buckets.size>=5000)return false;}
  bucket={window,remaining:0,blocked:false};buckets.set(key,bucket);
 }else if(bucket.window!==window){bucket={window,remaining:0,blocked:false};buckets.set(key,bucket);}
 if(bucket.blocked)return false;
 if(bucket.remaining>0){bucket.remaining--;return true;}
 const current=bucket;
 const task=(async()=>{if(db){try{const row=await db.prepare('INSERT INTO request_buckets (key,window_start,hits) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=hits+excluded.hits RETURNING hits').bind(key+':'+window,window,config.block).first<{hits:number}>();if(!row||row.hits>limit){current.blocked=true;return;}current.remaining=config.block;
   if(now-cleanupAt>60000){cleanupAt=now;await db.prepare('DELETE FROM request_buckets WHERE key IN (SELECT key FROM request_buckets WHERE window_start < ? LIMIT 5000)').bind(window-60000).run();}return;
  }catch{/* A local ceiling remains enforced when D1 is unavailable. */}}
  // Without D1 this reservation lasts for the minute, not just one block.
  if(current.localAllocated){current.blocked=true;return;}current.localAllocated=true;current.remaining=limit;
 })();await task;
 if(current.blocked)return false;if(current.remaining<=0){current.blocked=true;return false;}current.remaining--;return true;
}
async function reserve(key:string,g:Group,shared:boolean,db?:DB){
 const previous=locks.get(key)||Promise.resolve();let unlock!:()=>void;const next=new Promise<void>(resolve=>unlock=resolve);locks.set(key,next);await previous;
 try{return await reserveUnlocked(key,g,shared,db);}finally{unlock();if(locks.get(key)===next)locks.delete(key);}
}
export async function guardRequest(req:Request,db?:DB,secret?:string,override?:'resolve',trustedEdge=false){

 const url=new URL(req.url),api=url.pathname.startsWith('/api/');const noop=()=>{};
 if(req.url.length>(['/api/media','/api/download'].includes(url.pathname)?16000:4096))return {response:reject('请求地址过长',414),release:noop};
 if(api&&!['/api/catalog','/api/subject','/api/episodes','/api/related','/api/people','/api/cover','/api/danmaku','/api/rules','/api/source','/api/media','/api/download','/api/library','/api/auth','/api/discussions'].includes(url.pathname))return {response:reject('接口不存在',404),release:noop};
 if(!['GET','HEAD'].includes(req.method)&&!(req.method==='POST'&&['/api/source','/api/download','/api/library','/api/auth','/api/discussions'].includes(url.pathname)))return {response:reject('请求方法不支持',405),release:noop};
 if(!api&&/\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname))return {release:noop};
 if(req.method==='POST'){
  const origin=req.headers.get('origin');if(origin&&origin!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')return {response:reject('跨站请求被拒绝',403),release:noop};
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return {response:reject('请使用 JSON 请求',415),release:noop};
  if(Number(req.headers.get('content-length'))>(url.pathname==='/api/library'?262144:65536))return {response:reject('请求过大',413),release:noop};
 }
 const g=override||group(req),client=await identity(req,secret,trustedEdge,g==='personal'),key=client+':'+g,shared=client==='shared',config=limits[g],retry=Math.max(1,Math.ceil((60000-Date.now()%60000)/1000));
 if((globalActive.get(g)||0)>=config.parallel||(active.get(key)||0)>=(shared?config.parallel:config.clientParallel))return {response:reject('当前请求较多，请稍后重试',429,3),release:noop};
 // Reserve concurrency before the asynchronous rate lookup as well.
 globalActive.set(g,(globalActive.get(g)||0)+1);active.set(key,(active.get(key)||0)+1);let released=false;
 const release=()=>{if(released)return;released=true;globalActive.set(g,Math.max(0,(globalActive.get(g)||1)-1));const n=(active.get(key)||1)-1;if(n>0)active.set(key,n);else active.delete(key);};
 try{if(!await reserve(key,g,shared,db)){release();return {response:reject('访问过于频繁，请稍后重试',429,retry),release:noop};}}catch{release();return {response:reject('服务繁忙，请稍后重试',503,3),release:noop};}
 return {release};
}
export function secureResponse(response:Response,release:()=>void=()=>{}){
 const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if((headers.get('content-type')||'').includes('text/html')&&!headers.has('content-security-policy'))headers.set('Content-Security-Policy',"frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; object-src 'none'; base-uri 'self'");
 if(response.status>=400)headers.set('Cache-Control','no-store');
 if(!response.body){release();return new Response(null,{status:response.status,statusText:response.statusText,headers});}
 const reader=response.body.getReader();const body=new ReadableStream<Uint8Array>({async pull(controller){try{const {value,done}=await reader.read();if(done){release();controller.close();}else controller.enqueue(value);}catch(error){release();controller.error(error);}},async cancel(reason){release();await reader.cancel(reason);}});
 // Workers ignores manually set Content-Length on a generic ReadableStream.
 // Keep native downloads measurable/resumable without buffering the file.
 const length=headers.get('content-length');if(/^attachment(?:;|$)/i.test(headers.get('content-disposition')||'')&&length&&/^\d+$/.test(length)&&Number.isSafeInteger(Number(length))&&typeof FixedLengthStream!=='undefined'){
  const fixed=new FixedLengthStream(Number(length));void body.pipeTo(fixed.writable).catch(()=>{});return new Response(fixed.readable,{status:response.status,statusText:response.statusText,headers});
 }
 return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
