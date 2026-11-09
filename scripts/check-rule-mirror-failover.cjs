const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(fetch){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/rule-subscription-server.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,fetch,URL,Response,Headers,ReadableStream,TextEncoder,TextDecoder,Uint8Array,DecompressionStream,AbortController,AbortSignal,console,require:name=>{assert.equal(name,'./rules-snapshot.json');return {default:{entries:[]}};}},{filename:'lib/rule-subscription-server.ts'});return exports;
}
const tests=[],test=(name,run)=>tests.push([name,run]);
const index=(count=18)=>Array.from({length:count},(_,i)=>({name:'Rule'+i}));
function fileResponse(url){const name=decodeURIComponent(url.split('/').pop()).slice(0,-5);return Response.json({name,baseURL:'https://source.example/',originMarker:new URL(url).host});}
test('Workers-compatible fallback reads all 18 rules when the archive is unavailable',async()=>{
 const calls=[];const feeds=load(async(url,options)=>{
  calls.push({url,options});if(url.includes('codeload.github.com'))return new Response(null,{status:503});
  // Match the production Workers constraint instead of accepting every Node option.
  if(options.redirect==='error')throw Error('Invalid redirect value: Workers only implements follow/manual');
  assert.equal(options.redirect,'manual');if(url.endsWith('index.json'))return Response.json(index());return fileResponse(url);
 });
 const result=await feeds.archiveRules();assert.equal(result.length,18);assert.equal(new Set(result.map(e=>e.file)).size,18);assert.equal(new Set(result.map(e=>e.rule.originMarker)).size,1,'one complete source wins; partial feeds are never merged');assert.ok(calls.length<=43);
});
test('two equally fast 18-rule feeds cannot starve each other of the final requests',async()=>{
 let count=0;const batches=new Map();const feeds=load(async(url,options)=>{
  if(url.includes('codeload.github.com'))return new Response(null,{status:503});count++;
  if(url.endsWith('index.json'))return Response.json(index());
  // Keep both three-file workers at the same round-trip boundary. The final
  // batch must be able to issue six reads before either mirror wins.
  const round=Math.floor(Number(url.match(/Rule(\d+)\.json$/)[1])/3);
  return new Promise((resolve,reject)=>{
   const batch=batches.get(round)||[];batches.set(round,batch);batch.push({url,resolve});
   options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});
   if(batch.length===6)batch.forEach(task=>task.resolve(fileResponse(task.url)));
  });
 });
 let timer;const result=await Promise.race([feeds.archiveRules(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No complete mirror after '+count+' requests; batches '+JSON.stringify([...batches].map(([round,batch])=>[round,batch.length])))),2000);})]).finally(()=>clearTimeout(timer));assert.equal(result.length,18);assert.ok(count>=38,'both indexes and both complete 18-rule feeds fit the same request budget');assert.ok(count<=42);
});
test('redirect destinations are rejected and rejected response bodies are cancelled',async()=>{
 const calls=[];let cancelled=0;
 const rejected=status=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('unread'));},cancel(){cancelled++;}}),{status,headers:{Location:'https://internal.example/never-fetch'}});
 const feeds=load(async(url,options)=>{
  calls.push(url);if(url.includes('codeload.github.com'))return new Response(null,{status:503});
  assert.equal(options.redirect,'manual');const host=new URL(url).host;
  if(host==='raw.githubusercontent.com'||host==='gh-proxy.org')return rejected(302);
  if(host!=='ghfast.top')return rejected(503);
  if(url.endsWith('index.json'))return Response.json(index());return fileResponse(url);
 });
 const result=await feeds.archiveRules();await Promise.resolve();assert.equal(result.length,18);assert.ok(result.every(e=>e.rule.originMarker==='ghfast.top'));assert.ok(!calls.some(url=>url.includes('internal.example')));assert.ok(cancelled>=2,'rejected redirects release their streams');
});
test('partial or oversized indexes still stop within the bounded request budget',async()=>{
 let count=0;const feeds=load(async url=>{if(url.includes('codeload.github.com'))return new Response(null,{status:503});count++;if(url.endsWith('index.json'))return Response.json(index(100));return fileResponse(url);});
 await assert.rejects(feeds.archiveRules());assert.ok(count<=42);assert.ok(count>0);
});
test('invalid indexes never become a successful partial catalogue',async()=>{
 let files=0;const feeds=load(async url=>{if(url.includes('codeload.github.com'))return new Response(null,{status:503});if(url.endsWith('index.json'))return Response.json([{name:'Rule0'},{name:'Rule0'}]);files++;return fileResponse(url);});
 await assert.rejects(feeds.archiveRules());assert.equal(files,0);
});
(async()=>{let failed=0;for(const [name,run]of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})();
