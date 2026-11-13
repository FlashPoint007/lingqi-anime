const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,deps={}){const exports={};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{exports,require:name=>name in deps?deps[name]:load(path.resolve(path.dirname(file),name+'.ts'),deps),URL,Date,Map,Set,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout},{filename:file});return exports;}
const plain=x=>JSON.parse(JSON.stringify(x)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};},tick=()=>new Promise(resolve=>setImmediate(resolve));
const lib=load('lib/collection-backlog.ts'),now=Date.parse('2026-11-11T16:00:00Z'),evidence={directory:new Set([0,2,4]),verified:new Set([2]),checked:true};
(async()=>{
 const metadata={data:[{id:1,sort:0,airdate:'2026-11-10'},{id:2,sort:1,airdate:'2026-11-11'},{id:3,sort:2,airdate:'2026-11-12'},{id:4,sort:3,airdate:'2026-11-13'},{id:5,sort:4},{id:6,sort:5,airdate:'2026-11-10',type:1}],total:6,complete:true,checkedAt:now};
 const record={number:8,position:12,progresses:{1:{completed:true},2:{position:12,completed:false}}};
 let result=lib.collectionBacklog(metadata,record,evidence,now);assert.deepEqual(plain(result),{aired:3,pending:2,unknownDates:1,uncertain:true,next:0,directory:2,verified:1,checked:true});
 assert.equal(lib.collectionBacklog(metadata,{...record,number:100},evidence,now).pending,2,'a later played episode never implies earlier episodes completed');
 assert.equal(lib.collectionBacklog({...metadata,data:[]},undefined,evidence,now).uncertain,true,'missing catalogue is unknown, not caught up');
 assert.equal(lib.collectionBacklog({...metadata,data:metadata.data.slice(0,3),complete:false},record,evidence,now).uncertain,true,'truncated catalogue is a lower bound');
 assert.equal(lib.validAirdate('2026-02-30'),false);assert.equal(lib.validAirdate('2026-11-12'),true);
 assert.deepEqual(plain(lib.backlogSubjects([{id:1,collectionStatus:'watching'},{id:2,collectionStatus:'completed'},{id:3,collectionStatus:'planned'},{id:4,collectionStatus:'on_hold'},{id:0}]).map(s=>s.id)),[1,3]);
 const catalog=load('lib/catalog.ts');assert.deepEqual(plain(catalog.normalizeEpisodes({data:[{id:7,sort:3,airdate:'2026-11-12',type:0}],total:1}).data),[{id:7,sort:3,name:'',name_cn:'',airdate:'2026-11-12',type:0}]);
 // Fetches all available pages without confusing total episode count with aired count.
 const calls=[],request=async url=>{calls.push(url);const offset=Number(new URL(url,'https://site.test').searchParams.get('offset'));return {total:205,data:Array.from({length:Math.min(100,205-offset)},(_,i)=>({id:offset+i+1,sort:offset+i+1,airdate:'2026-11-10'}))};};
 const complete=await lib.loadBacklogMetadata(1,new AbortController().signal,request,now);assert.equal(complete.complete,true);assert.equal(complete.data.length,205);assert.equal(calls.length,3);
 await lib.loadBacklogMetadata(1,new AbortController().signal,()=>{throw Error('cache miss');},now+1);assert.equal(calls.length,3);
 const stale=await lib.loadBacklogMetadata(1,new AbortController().signal,()=>{throw Error('offline');},now+700000);assert.equal(stale.stale,true);
 const partial=await lib.loadBacklogMetadata(2,new AbortController().signal,async url=>{const offset=Number(new URL(url,'https://site.test').searchParams.get('offset'));return {total:1300,data:Array.from({length:100},(_,i)=>({id:offset+i+1,sort:offset+i+1}))};},now);assert.equal(partial.data.length,300);assert.equal(partial.complete,false);
 // Explicit refresh must pass through both browser and server episode caches.
 const forced=[];await lib.loadBacklogMetadata(10,new AbortController().signal,async(url,options)=>{forced.push({url,options});const offset=Number(new URL(url,'https://site.test').searchParams.get('offset'));return {total:101,data:Array.from({length:Math.min(100,101-offset)},(_,i)=>({id:offset+i+1,sort:offset+i+1,airdate:'2026-11-10'}))};},now,true);
 assert.equal(forced.length,2);for(const call of forced){assert.equal(new URL(call.url,'https://site.test').searchParams.get('refresh'),'1');assert.equal(call.options.cache,'no-store');}
 // An HTTP 200 stale fallback can affect any page, not only a thrown request.
 const serverStale=await lib.loadBacklogMetadata(11,new AbortController().signal,async url=>{const offset=Number(new URL(url,'https://site.test').searchParams.get('offset'));return {total:101,cacheStale:offset===100,data:Array.from({length:Math.min(100,101-offset)},(_,i)=>({id:offset+i+1,sort:offset+i+1,airdate:'2026-11-10'}))};},now);
 assert.equal(serverStale.stale,true);assert.equal(lib.collectionBacklog(serverStale,undefined,evidence,now).uncertain,true,'stale episode dates must not look like an exact current total');
 let rechecks=0;const recovered=await lib.loadBacklogMetadata(11,new AbortController().signal,async()=>{rechecks++;return {total:1,data:[{id:1,sort:1,airdate:'2026-11-10'}]};},now+1);assert.equal(rechecks,1,'server stale metadata must be rechecked on the next visit, not promoted to a fresh ten-minute cache');assert.notEqual(recovered.stale,true);
 await lib.loadBacklogMetadata(11,new AbortController().signal,()=>{throw Error('fresh metadata should be reused');},now+2);
 const aborted=new AbortController();aborted.abort();await assert.rejects(lib.loadBacklogMetadata(1,aborted.signal,request,now));
 await assert.rejects(lib.loadBacklogMetadata(3,new AbortController().signal,async()=>({data:[null],total:1}),now),/正篇/);
 const rules=[{name:'A',baseURL:'https://source.test'}],checks={A:{state:'playing',checkedAt:now,episodeNumber:30,roads:[{name:'main',episodes:[{name:'第1集'},{name:'第2集'}]}],results:[]}};
 lib.rememberBacklogAvailability(4,checks,'alice',rules,now);let seen=lib.readBacklogAvailability(4,'alice',rules,now,[29,30,31]);assert.deepEqual([...seen.directory],[29,30],'local second-season directory aligns to canonical Bangumi episode numbers');assert.deepEqual([...seen.verified],[30]);
 assert.equal(lib.readBacklogAvailability(4,'bob',rules,now).checked,false);assert.equal(lib.readBacklogAvailability(4,'alice',[{...rules[0],enabled:false}],now).checked,false);assert.equal(lib.readBacklogAvailability(4,'alice',rules,now+600000).checked,false);
 lib.rememberBacklogAvailability(4,checks,null,rules,now);assert.equal(lib.readBacklogAvailability(4,'anonymous',rules,now).checked,false,'private playback creates no evidence');
 lib.rememberBacklogAvailability(4,{A:{...checks.A,state:'episode-error'}},'alice',rules,now+1);assert.equal(lib.readBacklogAvailability(4,'alice',rules,now+1).verified.size,0,'failed playback clears the previous success for the current episode');
 // Execute the production component hook, not a copy of the worker loop.
 const slots=[],effects=[],requests=[],jsx=(type,props)=>({type,props});let cursor=0,active=0,maxActive=0,realMetadata=false;const componentMetadata=load('lib/collection-backlog.ts');
 function queued(id,signal,url,options){const wait=deferred();active++;maxActive=Math.max(maxActive,active);const call={id,signal,url,options,resolved:false,resolve(){assert.equal(call.resolved,false);call.resolved=true;active--;wait.resolve({data:[{id,sort:1,airdate:'2026-11-10'}],total:1,complete:true,checkedAt:now});}};requests.push(call);return wait.promise;}
 const react={useState(initial){const at=cursor++;if(!slots[at])slots[at]={value:typeof initial==='function'?initial():initial};return [slots[at].value,value=>{slots[at].value=typeof value==='function'?value(slots[at].value):value;}];},useRef(value){const at=cursor++;return slots[at]||(slots[at]={current:value});},useMemo(fn){cursor++;return fn();},useEffect(fn,deps){const at=cursor++,old=slots[at];if(!old||deps.some((v,i)=>v!==old.deps[i])){slots[at]={deps};effects.push(()=>{old?.cleanup?.();slots[at].cleanup=fn();});}}};
 const exported={};vm.runInNewContext(compile(fs.readFileSync('components/CollectionBacklog.tsx','utf8')),{exports:exported,Date,AbortController,window:{addEventListener(){},removeEventListener(){}},setInterval:()=>0,clearInterval(){},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='../lib/collection-backlog'?{...lib,loadBacklogMetadata(id,signal,request,checkedAt,force){return realMetadata?componentMetadata.loadBacklogMetadata(id,signal,(url,options)=>queued(id,signal,url,options),now,force):queued(id,signal);}}:name.endsWith('.css')?{}:(()=>{throw Error('unexpected '+name);})()});
 let props={items:Array.from({length:20},(_,i)=>({id:i+10,name:'Show '+i})),history:[],owner:'alice',rules:[],disabled:false,onOpen(){},onPlay(){}};
 const render=next=>{props={...props,...next};cursor=0;const tree=exported.default(props);effects.splice(0).forEach(fn=>fn());return tree;};
 const text=tree=>{if(tree===null||tree===undefined||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return [tree.props?.children].flat(Infinity).map(text).join(' ');};
 render();assert.equal(requests.length,2);assert.equal(maxActive,2,'metadata requests are bounded to two concurrent titles');
 for(let done=0;done<12;done+=2){requests[done].resolve();requests[done+1].resolve();await tick();}
 assert.equal(requests.length,12,'first batch never fetches the entire collection');assert.match(text(render()),/12 \/ 20/);
 render({owner:'bob',items:[{id:100,name:'Bob'}]});assert.match(text(render()),/正在读取放送目录/);assert.doesNotMatch(text(render()),/Show 0/,'a new owner cannot render previous owner metadata rows');
 const old=requests[12];render({owner:'carol',items:[{id:101,name:'Carol'}]});assert.equal(old.signal.aborted,true);old.resolve();await tick();assert.doesNotMatch(text(render()),/1 集待看/,'late completion from previous owner is ignored');requests[13].resolve();await tick();assert.match(text(render()),/1 集待看/);
 // Exercise the real 120-title metadata LRU through the production component.
 // Continuing beyond it must only fetch the twelve new titles, never refetch
 // the old prefix after cache eviction, and must keep loaded rows visible.
 const find=(tree,predicate)=>{if(!tree||typeof tree!=='object')return;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}};
 const drain=async()=>{for(let turn=0;turn<200;turn++){await tick();const pending=requests.filter(call=>!call.resolved&&!call.signal.aborted);if(!pending.length){await tick();if(!requests.some(call=>!call.resolved&&!call.signal.aborted))return;}for(const call of pending)call.resolve();}throw Error('metadata workers did not settle');};
 realMetadata=true;maxActive=0;const start=requests.length;render({owner:'capacity',items:Array.from({length:144},(_,i)=>({id:1000+i,name:'Capacity '+i}))});await drain();assert.equal(requests.length-start,12);
 for(let batch=2;batch<=12;batch++){
  const before=requests.length,tree=render(),button=find(tree,node=>node.type==='button'&&text(node).includes('继续统计后'));
  assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick();render();
  // Read a settled render after the effect, while the new batch is pending.
  assert.match(text(render()),new RegExp('已统计 '+((batch-1)*12)+' / 144'),'adding a batch must not blank the previous summary');
  await drain();assert.equal(requests.length-before,12,'only newly requested twelve titles are fetched, including after cache capacity');
 }
 assert.equal(requests.length-start,144);assert.equal(new Set(requests.slice(start).map(call=>call.id)).size,144);assert.equal(maxActive,2);
 const refreshStart=requests.length;find(render(),node=>node.type==='button'&&text(node)==='更新汇总').props.onClick();render();await drain();assert.equal(requests.length-refreshStart,144,'explicit refresh checks the full loaded range');for(const call of requests.slice(refreshStart)){assert.equal(new URL(call.url,'https://site.test').searchParams.get('refresh'),'1');assert.equal(call.options.cache,'no-store');}assert.equal(maxActive,2,'refresh also respects the two-title concurrency cap');
 slots.forEach(s=>s?.cleanup?.());
 console.log('PASS: per-episode completion, Beijing air dates, missing/truncated catalogues, metadata pagination/cache/failure, forced-refresh propagation and stale-page honesty, canonical season numbers, source expiry/owner/privacy fences, incremental 144-title batches beyond cache capacity, two-worker full refresh and stale account callbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
