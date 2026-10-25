const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{AsyncLocalStorage}=require('node:async_hooks'),{createHash}=require('node:crypto');
const requests=new AsyncLocalStorage(),background=[];let now=100000;
// Reproduce Workers' request ownership rule for body streams, not just values.
class ScopedResponse extends Response{
 constructor(body,init){super(body,init);this.owner=requests.getStore();}
 static json(value,init={}){const headers=new Headers(init.headers);headers.set('content-type','application/json');return new ScopedResponse(JSON.stringify(value),{...init,headers});}
 check(){if(this.owner!==requests.getStore())throw Error('Cannot perform I/O on behalf of a different request');}
 clone(){this.check();const copy=super.clone();return new ScopedResponse(copy.body,{status:copy.status,headers:copy.headers});}
 text(){this.check();return super.text();}
}
const db={prepare(){return {bind(){return this;},async first(){return null;},async run(){return {};}};},async batch(){return [];}};
const exportsObject={},source=ts.transpileModule(fs.readFileSync('lib/server-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{exports:exportsObject,require:name=>{assert.equal(name,'cloudflare:workers');return {env:{DB:db},waitUntil:task=>background.push(task)};},Response:ScopedResponse,Headers,TextEncoder,Date:{now:()=>now},crypto:{subtle:{digest:async(_,bytes)=>Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer}},setTimeout,clearTimeout,console});
const cache=exportsObject.cachedJson,tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));},run=(id,fn)=>requests.run(id,fn),read=(id,response)=>run(id,async()=>JSON.parse(await response.text()));
(async()=>{
 let release,loads=0;const gate=new Promise(resolve=>release=resolve),options={ttl:10,stale:100000};
 const first=run('first',()=>cache('catalog','coalesced',async()=>{loads++;await gate;return {items:[1,2]};},options));await tick();
 const second=run('second',()=>cache('catalog','coalesced',async()=>{throw Error('duplicate loader');},options));await tick();release();
 const [a,b]=await Promise.all([first,second]);assert.equal(loads,1);assert.deepEqual(await read('first',a),{items:[1,2]});assert.deepEqual(await read('second',b),{items:[1,2]});assert.notEqual(a,b);
 console.log('PASS concurrent requests share metadata work without sharing request-owned responses');
 // A forced request may wait for another request's in-flight background refresh.
 now+=20;let refreshed;const update=new Promise(resolve=>refreshed=resolve);
 const stale=await run('background-owner',()=>cache('catalog','coalesced',async()=>{await update;return {items:[3]};},{...options,background:true}));assert.equal((await read('background-owner',stale)).cacheStale,true);await tick();
 const forced=run('forced-reader',()=>cache('catalog','coalesced',async()=>{throw Error('refresh must be coalesced');},{...options,refresh:true}));await tick();refreshed();const fresh=await forced;assert.deepEqual(await read('forced-reader',fresh),{items:[3]});
 assert.equal(fresh.headers.get('x-lingqi-cache'),'miss');assert.equal(fresh.headers.get('content-type'),'application/json');
 console.log('PASS forced readers can consume another request’s completed background refresh');
 const later=await run('later-reader',()=>cache('catalog','coalesced',async()=>{throw Error('must use cache');},options));assert.deepEqual(await read('later-reader',later),{items:[3]});
 await Promise.allSettled(background);console.log('PASS each later response also owns its own body and preserves cache headers');
})().catch(error=>{console.error(error);process.exitCode=1;});
