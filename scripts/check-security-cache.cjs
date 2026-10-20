const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
let clock=1800000000000;
class Clock extends Date{static now(){return clock;}}
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const statement of fs.readFileSync('drizzle/0000_illegal_the_watchers.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())sql.exec(statement);
 const db={sql,prepare(query){let params=[];return {bind(...values){params=values;return this;},async first(){return sql.prepare(query).get(...params)||null;},async run(){return sql.prepare(query).run(...params);}};},async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}};
 return db;
}
function load(file,dependencies={}){
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','false'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports,require(name){if(name in dependencies)return dependencies[name];throw Error('Unexpected import: '+name);},Date:Clock,Request,Response,Headers,ReadableStream,TextEncoder,TextDecoder,URL,crypto:webcrypto,setTimeout,clearTimeout,process:{env:{}},console};
 vm.runInNewContext(code,context,{filename:file});return exports;
}
const req=(path='/api/catalog',ip='203.0.113.1',init={})=>{const request=new Request('https://site.example'+path,{...init,headers:{'cf-connecting-ip':ip,...init.headers}});Object.defineProperty(request,'cf',{value:{}});return request;};
const secret='test-key-with-more-than-thirty-two-bytes';
(async()=>{
 const background=[];const db=database(),fresh=()=>load('lib/server-cache.ts',{'cloudflare:workers':{env:{DB:db},waitUntil:task=>background.push(task)}});
 let cache=fresh(),calls=0;
 const get=()=>cache.cachedJson('catalog','query',async()=>({data:[{id:++calls}]}),{ttl:1000,stale:10000});
 let response=await get();assert.equal(response.headers.get('x-lingqi-storage'),'d1');assert.equal((await response.json()).data[0].id,1);
 assert.equal((await get()).headers.get('x-lingqi-cache'),'memory');assert.equal(calls,1);
 cache=fresh();assert.equal((await get()).headers.get('x-lingqi-cache'),'database');assert.equal(calls,1);
 await cache.cachedJson('catalog','query',async()=>({data:[{id:++calls}]}),{ttl:1000,stale:10000,refresh:true});assert.equal(calls,2);
 clock+=1001;
 response=await cache.cachedJson('catalog','query',async()=>{throw Error('origin down');},{ttl:1000,stale:10000});let data=await response.json();assert.equal(data.cacheStale,true);assert.equal(data.offline,true);assert.equal(data.data[0].id,2);assert.equal(response.headers.get('cache-control'),'no-store');
 // Stale public catalogue rows return before a slow refresh and coalesce it.
 await cache.cachedJson('catalog','background',async()=>({value:'old'}),{ttl:1000,stale:10000});clock+=1001;
 let finishRefresh,backgroundCalls=0;const refreshGate=new Promise(resolve=>finishRefresh=resolve),slowRefresh=async()=>{backgroundCalls++;await refreshGate;return {value:'new'};};
 const fast=await cache.cachedJson('catalog','background',slowRefresh,{ttl:1000,stale:10000,background:true});assert.equal((await fast.json()).value,'old');assert.equal(fast.headers.get('x-lingqi-cache'),'stale-updating');
 const alsoFast=await cache.cachedJson('catalog','background',slowRefresh,{ttl:1000,stale:10000,background:true});assert.equal((await alsoFast.json()).value,'old');assert.equal(backgroundCalls,1);assert.equal(background.length,1);
 finishRefresh();await Promise.all(background);assert.equal((await (await cache.cachedJson('catalog','background',slowRefresh,{ttl:1000,stale:10000,background:true})).json()).value,'new');
 clock+=10001;await assert.rejects(cache.cachedJson('catalog','query',async()=>{throw Error('origin down');},{ttl:1000,stale:10000}),/origin down/);
 let unlock;const gate=new Promise(resolve=>unlock=resolve);calls=0;
 const batch=Array.from({length:12},()=>cache.cachedJson('source-chapters','one',async()=>{calls++;await gate;return {roads:[]};},{ttl:1000,stale:1000}));
 await new Promise(resolve=>setTimeout(resolve,20));unlock();await Promise.all(batch);assert.equal(calls,1,'coalesce identical concurrent misses');
 await assert.rejects(cache.cachedJson('source-search','failed',async()=>{throw Error('bad');},{ttl:1000,stale:1000}));
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS count FROM shared_cache WHERE key=?').get(await cache.cacheKey('source-search','failed')).count,0);
 const large=await cache.cachedJson('source-chapters','large',async()=>({html:'x'.repeat(200*1024)}),{ttl:1000,stale:1000});assert.equal(large.headers.get('x-lingqi-storage'),'bypass');assert.equal(db.sql.prepare('SELECT COUNT(*) AS count FROM shared_cache WHERE key=?').get(await cache.cacheKey('source-chapters','large')).count,0);
 const corruptKey=await cache.cacheKey('catalog','corrupt');db.sql.prepare('INSERT INTO shared_cache VALUES(?,?,?,?,?,?)').run(corruptKey,'catalog','{',clock,clock+1000,clock+10000);
 assert.equal((await (await cache.cachedJson('catalog','corrupt',async()=>({fixed:true}),{ttl:1000,stale:1000})).json()).fixed,true);
 const broken={prepare(){throw Error('D1 down');}};cache=load('lib/server-cache.ts',{'cloudflare:workers':{env:{DB:broken}}});response=await cache.cachedJson('catalog','uncached',async()=>({ok:true}),{ttl:1000,stale:1000});assert.equal(response.status,200);assert.equal(response.headers.get('x-lingqi-storage'),'bypass');
 clock+=60001;cache=fresh();for(let i=0;i<1002;i++)db.sql.prepare('INSERT INTO shared_cache VALUES(?,?,?,?,?,?)').run('capacity:'+i,'catalog','{}',clock-1,clock+1000,clock+10000);
 await cache.cachedJson('catalog','cleanup',async()=>({ok:true}),{ttl:1000,stale:1000});assert.ok(db.sql.prepare('SELECT COUNT(*) AS count FROM shared_cache').get().count<=1000);
 // Real SQLite executes the same atomic reservation SQL used by D1.
 const rateDb=database();let guard=load('lib/request-guard.ts');
 for(let i=0;i<180;i++){const result=await guard.guardRequest(req(),rateDb,secret);assert.equal(result.response,undefined);result.release();}
 let denied=await guard.guardRequest(req(),rateDb,secret);assert.equal(denied.response.status,429);assert.ok(Number(denied.response.headers.get('retry-after'))>0);
 const otherIsolate=load('lib/request-guard.ts');assert.equal((await otherIsolate.guardRequest(req(),rateDb,secret)).response.status,429,'quota shared across isolates');
 assert.ok(rateDb.sql.prepare('SELECT key FROM request_buckets').all().every(row=>!row.key.includes('203.0.113.1')));
 clock+=60000;let allowed=await guard.guardRequest(req(),rateDb,secret);assert.equal(allowed.response,undefined);allowed.release();
 guard=load('lib/request-guard.ts');for(let i=0;i<300;i++){allowed=await guard.guardRequest(req('/'),undefined,secret);assert.equal(allowed.response,undefined);allowed.release();}assert.equal((await guard.guardRequest(req('/'),undefined,secret)).response.status,429,'local fallback cannot refill forever');
 guard=load('lib/request-guard.ts');const active=[];for(let i=0;i<8;i++){allowed=await guard.guardRequest(req('/api/source'),rateDb,secret);assert.equal(allowed.response,undefined);active.push(allowed.release);}assert.equal((await guard.guardRequest(req('/api/source'),rateDb,secret)).response.status,429);active.forEach(release=>{release();release();});allowed=await guard.guardRequest(req('/api/source'),rateDb,secret);assert.equal(allowed.response,undefined);allowed.release();
 assert.equal((await guard.guardRequest(req('/api/nope'),rateDb,secret)).response.status,404);
 allowed=await guard.guardRequest(req('/api/cover?id=400602'),rateDb,secret);assert.equal(allowed.response,undefined,'cover downloads must reach the guarded handler');allowed.release();
 assert.equal((await guard.guardRequest(req('/api/cover?id=400602','203.0.113.1',{method:'POST'}),rateDb,secret)).response.status,405,'cover download endpoints remain read-only');
 assert.equal((await guard.guardRequest(req('/asset.js','203.0.113.1',{method:'POST'}),rateDb,secret)).response.status,405);
 assert.equal((await guard.guardRequest(req('/api/catalog?q='+'x'.repeat(4096)),rateDb,secret)).response.status,414);
 assert.equal((await guard.guardRequest(req('/api/source','203.0.113.1',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}),rateDb,secret)).response.status,403);
 assert.equal((await guard.guardRequest(req('/api/source','203.0.113.1',{method:'POST',body:'{}'}),rateDb,secret)).response.status,415);
 await assert.rejects(guard.readRequestText(req('/api/source','203.0.113.1',{method:'POST',body:'中'.repeat(22000)})),error=>error.status===413);
 await assert.rejects(guard.readRequestText(req('/api/source','203.0.113.1',{method:'POST',headers:{'content-length':'70000'},body:'{}'})),error=>error.status===413);
 assert.equal(await guard.readRequestText(req('/api/source','203.0.113.1',{method:'POST',body:'{"ok":true}'})),'{"ok":true}');
 // The caller cannot use an untrusted forwarding header to choose a database identity.
 const untrusted=new Request('https://site.example/api/subject',{headers:{'cf-connecting-ip':'203.0.113.123','x-forwarded-for':'203.0.113.4'}});allowed=await guard.guardRequest(untrusted,rateDb,secret);allowed.release();assert.ok(rateDb.sql.prepare('SELECT key FROM request_buckets').all().some(row=>row.key.startsWith('shared:metadata:')));
 const capacity=load('lib/request-guard.ts');for(let i=0;i<5000;i++){allowed=await capacity.guardRequest(req('/api/catalog','198.51.'+Math.floor(i/256)+'.'+i%256),undefined,secret);assert.equal(allowed.response,undefined);allowed.release();}for(let i=5000;i<5010;i++)assert.equal((await capacity.guardRequest(req('/api/catalog','198.51.'+Math.floor(i/256)+'.'+i%256),undefined,secret)).response.status,429);clock+=60000;allowed=await capacity.guardRequest(req(),undefined,secret);assert.equal(allowed.response,undefined);allowed.release();
 // Trusted signed-in identity keeps the personal quota stable across IP changes.
 const personalGuard=load('lib/request-guard.ts'),personalDb=database();
 for(let i=0;i<120;i++){allowed=await personalGuard.guardRequest(req('/api/library','203.0.113.'+i,{headers:{'oai-authenticated-user-id':'account-a'}}),personalDb,secret,undefined,true);assert.equal(allowed.response,undefined);allowed.release();}
 assert.equal((await personalGuard.guardRequest(req('/api/library','198.51.100.9',{headers:{'oai-authenticated-user-id':'account-a'}}),personalDb,secret,undefined,true)).response.status,429);
 allowed=await personalGuard.guardRequest(req('/api/library','198.51.100.9',{headers:{'oai-authenticated-user-id':'account-b'}}),personalDb,secret,undefined,true);assert.equal(allowed.response,undefined);allowed.release();
 const fake=new Request('https://site.example/api/library',{headers:{'oai-authenticated-user-id':'account-a','cf-connecting-ip':'203.0.113.1'}});allowed=await personalGuard.guardRequest(fake,personalDb,secret);assert.equal(allowed.response,undefined);allowed.release();assert.ok(personalDb.sql.prepare('SELECT key FROM request_buckets').all().some(row=>row.key.startsWith('shared:personal:')));
 assert.ok(personalDb.sql.prepare('SELECT key FROM request_buckets').all().every(row=>!row.key.includes('account-a')));
 let released=0;response=guard.secureResponse(new Response('<p>ok</p>',{headers:{'Content-Type':'text/html'}}),()=>released++);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/frame-ancestors/);await response.text();assert.equal(released,1);
 released=0;response=guard.secureResponse(new Response('hello'),()=>released++);await response.body.cancel();assert.equal(released,1);
 response=guard.secureResponse(new Response('',{headers:{'Content-Type':'text/html'}}));assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);assert.match(response.headers.get('content-security-policy'),/base-uri 'self'/);await response.text();
 // Exercise the actual Worker wrapper, including its bounded source-body replay.
 const workerGuard=load('lib/request-guard.ts');let handled=0;const worker=load('build/sites-worker.ts',{'vinext/server/fetch-handler':{default:{async fetch(request){handled++;return Response.json({body:await request.json()});}}},'../lib/request-guard':workerGuard,'../lib/connector-context':{runWithConnectorBinding(_binding,fn){return fn();}}}).default;
 response=await worker.fetch(req('/api/source','203.0.113.1',{method:'POST',headers:{'content-type':'application/json'},body:'{"operation":"resolve"}'}),{DB:database()},{props:{}});assert.equal(response.status,200);assert.equal((await response.json()).body.operation,'resolve');assert.equal(handled,1);
 response=await worker.fetch(req('/api/source','203.0.113.1',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),{DB:database()},{props:{}});assert.equal(response.status,400);assert.equal(handled,1);
 const dispatchedDb=database();const dispatched=new Request(req('/api/source','203.0.113.7',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'1.2.3.4'},body:'{"operation":"resolve"}'}));assert.equal(dispatched.cf,undefined);response=await worker.fetch(dispatched,{DB:dispatchedDb,LINGQI_MEDIA_SECRET:secret},{props:{}});assert.equal(response.status,200);await response.text();const counters=dispatchedDb.sql.prepare('SELECT key FROM request_buckets').all();assert.equal(counters.length,2);assert.ok(counters.every(row=>!row.key.startsWith('shared:')&&!row.key.includes('203.0.113.7')),'dispatched requests use runtime secret and edge identity without cf metadata');
 console.log('PASS: SQLite cache persistence/expiry/stale/refresh/coalescing/capacity/corruption/failover; shared and local rate limits; concurrency; body bounds; identity privacy; Worker integration');
})().catch(error=>{console.error(error);process.exitCode=1;});
