import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const mod=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const coreUrl=mod(readFileSync('lib/web-core.ts','utf8')),core=await import(coreUrl);
const apiUrl=mod(readFileSync('lib/rule-api.ts','utf8').replace("'./web-core'",JSON.stringify(coreUrl)));
const playback=await import(mod(readFileSync('lib/playback-server.ts','utf8').replace("'./web-core'",JSON.stringify(coreUrl)).replace("'./rule-api'",JSON.stringify(apiUrl))));
for(const host of ['localhost.','metadata.internal.','foo.local.','router.lan.','home.','127.0.0.1.','[::1]','foo.localdomain','foo.intranet','foo.arpa','-bad.example','bad_.example'])assert.throws(()=>core.publicUrl('https://'+host));
assert.equal(core.publicUrl('https://7example.com./play').href,'https://7example.com/play');
const api=await import(apiUrl);assert.equal(api.mediaUrl('https://7example.com.:8443/seg.ts').href,'https://7example.com:8443/seg.ts');
assert.throws(()=>api.mediaUrl('https://metadata.internal.:8443/seg.ts'));
let cancelled=0;
await assert.rejects(playback.boundedText(new Response(new ReadableStream({cancel(){cancelled++;}})),100,20),/超时/);assert.equal(cancelled,1,'slow response releases its reader');
await assert.rejects(playback.boundedText(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-length':'101'}}),100),/过大/);assert.equal(cancelled,2,'declared oversized response is cancelled before reading');
const originalFetch=globalThis.fetch;
process.env.LINGQI_MEDIA_SECRET='test-only-review-key-not-used-in-production';
try{
 const media=await playback.signedMediaUrl('https://media.example/clip.mp4','https://source.example/play');
 let calls=0,forwarded='';
 globalThis.fetch=async(_url,init)=>{calls++;forwarded=init.headers.Range;return new Response('video',{status:206,headers:{'Content-Type':'video/mp4'}});};
 for(const range of ['bytes=-1024','bytes=1024-','bytes=0-4']){const res=await playback.proxyMedia(new Request('https://site.example'+media,{headers:{Range:range}}));assert.equal(res.status,206);assert.equal(forwarded,range);await res.text();}
 const before=calls;
 for(const range of ['bytes=-','bytes=-0','bytes=5-4','bytes=9007199254740992-','bytes=0-1,4-5'])assert.equal((await playback.proxyMedia(new Request('https://site.example'+media,{headers:{Range:range}}))).status,416);
 assert.equal(calls,before,'invalid ranges never contact upstream');
 globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status:416,headers:{'Content-Range':'bytes */100'}});
 const unsatisfiable=await playback.proxyMedia(new Request('https://site.example'+media,{headers:{Range:'bytes=200-'}}));assert.equal(unsatisfiable.status,416);assert.equal(unsatisfiable.headers.get('content-range'),'bytes */100');assert.equal(cancelled,3);
 globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status:302,headers:{Location:'https://metadata.internal./private'}});
 assert.equal((await playback.proxyMedia(new Request('https://site.example'+media))).status,502);assert.equal(cancelled,4,'redirect response cancelled before rejecting private target');
 globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'Content-Type':'text/html'}});
 assert.equal((await playback.proxyMedia(new Request('https://site.example'+media))).status,502);assert.equal(cancelled,5);
 globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'Content-Type':'video/mp4'}});
 assert.equal((await playback.proxyMedia(new Request('https://site.example'+media,{method:'HEAD'}))).status,200);assert.equal(cancelled,6);
 await assert.rejects(playback.signedMediaUrl('https://media.example/clip.mp4?q='+'x'.repeat(10000),'https://source.example'),/过长/);
 const playlist=await playback.signedMediaUrl('https://media.example/master.m3u8','https://source.example');
 const savedCrypto=Object.getOwnPropertyDescriptor(globalThis,'crypto'),native=globalThis.crypto;let signing=0,maxSigning=0,total=0;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{sign:async(...args)=>{total++;signing++;maxSigning=Math.max(maxSigning,signing);try{await new Promise(resolve=>setTimeout(resolve,1));return await native.subtle.sign(...args);}finally{signing--;}} ,verify:native.subtle.verify.bind(native.subtle)}}});
 try{
  globalThis.fetch=async()=>new Response('#EXTM3U\n   \n'+Array.from({length:50},(_,i)=>i+'.ts').join('\n'),{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
  const res=await playback.proxyMedia(new Request('https://site.example'+playlist));assert.equal(res.status,200);const text=await res.text();assert.equal((text.match(/ticket=/g)||[]).length,50);assert.ok(text.startsWith('#EXTM3U\n\n'));assert.ok(maxSigning>1&&maxSigning<=16);
  const signedBefore=total;globalThis.fetch=async()=>new Response('#EXTM3U\n'+'seg.ts\n'.repeat(4097));
  const huge=await playback.proxyMedia(new Request('https://site.example'+playlist));assert.equal(huge.status,502);assert.match(await huge.text(),/播放列表过大/);assert.equal(total,signedBefore,'oversized list rejected before signing');
 }finally{Object.defineProperty(globalThis,'crypto',savedCrypto);}
 const controller=new AbortController();let resolveCalls=0;
 globalThis.fetch=async(_url,init)=>{resolveCalls++;return await new Promise((_,reject)=>{init.signal.throwIfAborted();init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});};
 const resolving=playback.resolvePlayback({baseURL:'https://source.example'},'https://source.example/play',undefined,controller.signal);setTimeout(()=>controller.abort(),20);
 const resolved=await resolving;assert.equal(resolved.media,'');assert.match(resolved.reason,/取消/);assert.equal(resolveCalls,1);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: hostname canonicalization/private suffixes; body timeout/cancellation; suffix/open/invalid ranges; upstream 416; redirect/HEAD/error cleanup; ticket size; bounded HLS signing; resolver cancellation');
