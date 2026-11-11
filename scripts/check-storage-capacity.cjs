const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const lib={exports:{},setTimeout,clearTimeout};vm.runInNewContext(code('lib/storage-capacity.ts'),lib);const capacity=lib.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const text=node=>node==null?'':typeof node!=='object'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children);
const find=(node,predicate)=>{if(!node||typeof node!=='object')return;if(!Array.isArray(node)&&predicate(node))return node;for(const child of (Array.isArray(node)?node:[node.props?.children]).flat(Infinity)){const result=find(child,predicate);if(result)return result;}};
function mount(owner,{saved,estimate}){
 let cursor=0,dirty=false,alive=true,now=100000,timerId=0;const slots=[],effects=[],timers=new Map(),events=new Map(),root={tree:null,props:{owner}};
 const schedule=()=>{if(dirty||!alive)return;dirty=true;queueMicrotask(()=>{dirty=false;if(alive)root.render();});};
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;schedule();}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const add=(name,fn)=>events.set(name,fn),remove=name=>events.delete(name),jsx=(type,props)=>({type,props});
 const imports={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'../lib/offline-downloads':{offlineStoredBytes:saved},'../lib/storage-capacity':{...capacity,capacityDeadline:fn=>Promise.resolve().then(fn),readStorageCapacity:estimate},'./offline-capacity.css':{}};
 const context={exports:{},navigator:{storage:{}},window:{addEventListener:add,removeEventListener:remove},document:{visibilityState:'visible',addEventListener:add,removeEventListener:remove},Date:class extends Date{static now(){return now;}},setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),require:name=>{assert.ok(name in imports,'Unexpected dependency '+name);return imports[name];}};
 vm.runInNewContext(code('components/OfflineCapacity.tsx'),context);
 root.render=()=>{cursor=0;root.tree=context.exports.default(root.props);effects.splice(0).forEach(fn=>fn());};root.update=owner=>{root.props={owner};root.render();};root.event=name=>events.get(name)?.();root.advance=async milliseconds=>{now+=milliseconds;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}await tick();};root.stop=()=>{alive=false;slots.forEach(slot=>slot?.cleanup?.());};root.timerCount=()=>timers.size;root.render();return root;
}
(async()=>{
 for(const estimate of [{},{quota:100},{usage:0},{usage:-1,quota:10},{usage:1,quota:Infinity},{usage:NaN,quota:10},{usage:1,quota:-1}])assert.equal(capacity.normalizeStorageCapacity(estimate).state,'unavailable');
 let result=capacity.normalizeStorageCapacity({usage:120,quota:100});assert.equal(result.available,0);assert.equal(result.ratio,1);assert.equal(result.usage,120);
 result=capacity.normalizeStorageCapacity({usage:0,quota:0});assert.equal(result.state,'ready');assert.equal(result.available,0);
 assert.equal((await capacity.readStorageCapacity()).state,'unsupported');assert.equal((await capacity.readStorageCapacity({estimate:async()=>{throw Error('permission denied');}})).state,'unavailable');
 await assert.rejects(capacity.capacityDeadline(()=>new Promise(()=>{}),5),/超时/);
 assert.equal(capacity.storageSize(0),'0 B');assert.equal(capacity.storageSize(1024**3),'1.0 GiB');assert.equal(capacity.storageSize(-1),'未知');
 // Unsupported browser quota remains unknown while committed bytes still work.
 let reads=0;const root=mount('a',{saved:async()=>{reads++;return 2*1024*1024;},estimate:async()=>({state:'unsupported'})});await tick();
 assert.match(text(root.tree),/2.0 MiB/);assert.match(text(root.tree),/当前浏览器不提供/);assert.match(text(root.tree),/本站预计可用未知/);assert.doesNotMatch(text(root.tree),/统计中/);
 for(let n=0;n<50;n++)root.event('lingqi-downloads');await tick();assert.equal(reads,1);assert.equal(root.timerCount(),1);await root.advance(15000);assert.equal(reads,2,'many chunk events cause one bounded refresh');
 const refresh=find(root.tree,node=>node.type==='button'&&text(node)==='刷新容量');refresh.props.onClick();await tick();assert.equal(reads,3,'manual refresh is available without waiting for the throttle');root.stop();assert.equal(root.timerCount(),0);
 // A -> B -> A must not accept an old A response, even though owner text matches.
 const work=[],delayed=mount('a',{saved:owner=>{const read=deferred();work.push({owner,...read});return read.promise;},estimate:async()=>({state:'ready',usage:500,quota:1000,available:500,ratio:.5})});await tick();
 delayed.update('b');await tick();delayed.update('a');await tick();assert.equal(work.length,3);work[2].resolve(7*1024*1024);await tick();assert.match(text(delayed.tree),/7.0 MiB/);
 work[0].resolve(999*1024*1024);work[1].resolve(888*1024*1024);await tick();assert.match(text(delayed.tree),/7.0 MiB/);assert.doesNotMatch(text(delayed.tree),/999|888/);delayed.stop();
 // A completion event arriving during a slow estimate queues a follow-up refresh.
 const pending=deferred();let savedReads=0,estimates=0;const inflight=mount('a',{saved:async()=>{savedReads++;return 10;},estimate:()=>++estimates===1?pending.promise:Promise.resolve({state:'unavailable'})});await tick();inflight.event('lingqi-downloads');pending.resolve({state:'unavailable'});await tick();assert.equal(inflight.timerCount(),1);await inflight.advance(15000);assert.equal(savedReads,2);assert.match(text(inflight.tree),/暂时无法读取浏览器容量/);inflight.stop();
 // A failed local byte query is never rendered as an empty zero-byte library.
 const broken=mount('a',{saved:async()=>{throw Error('IDB unavailable');},estimate:async()=>({state:'unavailable'})});await tick();assert.match(text(broken.tree),/已保存视频无法读取/);assert.doesNotMatch(text(broken.tree),/0 B/);broken.stop();
 console.log('PASS: storage estimates reject invalid/missing data; bounded calls and manual refresh; scope-generation isolation; pending-change refresh; unavailable storage remains unknown');
})().catch(error=>{console.error(error);process.exitCode=1;});
