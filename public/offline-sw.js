import {readOffline,CHUNK_SIZE,byteRange} from './offline-db.mjs';
const SHELL='lingqi-offline-shell-6',FILES=['/offline','/offline-transfer-v2.mjs','/offline-db.mjs','/offline-player.js','/offline-hls.js','/offline-hls.LICENSE.txt'];
async function offlinePage(){
 const cached=await (await caches.open(SHELL)).match('/offline');if(!cached)return new Response('离线页面尚未准备好',{status:503});
 // A cached response fetched through a canonical .html redirect cannot be
 // reused directly for a navigation request whose redirect mode is manual.
 const headers=new Headers(cached.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');
 return new Response(await cached.text(),{status:200,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('lingqi-offline-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
async function media(request,url){
 const parts=url.pathname.split('/');if(parts.length!==4||!/^[-a-f0-9]{36}$/.test(parts[2])||!/^\d{1,5}$/.test(parts[3]))return new Response('Invalid offline media',{status:400});
 const download=await readOffline('downloads',parts[2]);if(download?.status!=='complete')return new Response('下载尚未完成或已删除',{status:404});
 const asset=await readOffline('assets',[parts[2],parts[3]]);if(!asset||!Number.isSafeInteger(asset.size)||asset.size<=0)return new Response('离线文件缺失，请重新下载',{status:404});
 const range=byteRange(request.headers.get('range'),asset.size);if(!range)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+asset.size}});
 const {start,end,partial}=range,headers=new Headers({'Content-Type':asset.type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(partial)headers.set('Content-Range','bytes '+start+'-'+end+'/'+asset.size);
 if(request.method==='HEAD')return new Response(null,{status:partial?206:200,headers});
 let offset=start;const stream=new ReadableStream({async pull(controller){if(offset>end){controller.close();return;}try{const index=Math.floor(offset/CHUNK_SIZE),chunk=await readOffline('chunks',[parts[2],parts[3],index]);if(!chunk?.bytes)throw Error('离线分片缺失');const bytes=new Uint8Array(chunk.bytes),at=offset-index*CHUNK_SIZE,length=Math.min(bytes.length-at,end-offset+1);if(length<=0)throw Error('离线分片无效');controller.enqueue(bytes.subarray(at,at+length));offset+=length;}catch(error){controller.error(error);}}});
 return new Response(request.method==='HEAD'?null:stream,{status:partial?206:200,headers});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||!['GET','HEAD'].includes(event.request.method))return;
 if(url.pathname.startsWith('/__offline_media/')){event.respondWith(media(event.request,url).catch(()=>new Response('离线存储不可用',{status:503})));return;}
 if(url.pathname==='/offline'||url.pathname==='/offline.html'){event.respondWith(offlinePage());return;}
 if(FILES.includes(url.pathname)){event.respondWith((async()=>{const cached=await (await caches.open(SHELL)).match(url.pathname);return cached||fetch(event.request);})());return;}
 if(event.request.mode==='navigate'&&url.pathname==='/'){event.respondWith(fetch(event.request).then(response=>response.status>=500?offlinePage():response).catch(()=>offlinePage()));}
});
