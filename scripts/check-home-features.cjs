const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-28T04:00:00Z']));}static now(){return new Date('2026-10-28T04:00:00Z').getTime();}}
const plain=value=>JSON.parse(JSON.stringify(value)),tick=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
function load(file,deps={},extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>{if(name in deps)return deps[name];throw Error('Unexpected dependency '+name);},URL,URLSearchParams,Date:Clock,Intl,AbortController,AbortSignal,Request,Response,Headers,setTimeout,clearTimeout,console,...extra},{filename:file});return exports;}
const catalog=load('lib/catalog.ts'),feature=load('lib/home-feature.ts',{'./catalog':catalog});
const show=(id,date='2026-10-01',score=7)=>({id,name:'Show '+id,date,type:2,rating:{score},images:{large:'https://images.example/'+id+'.jpg'}});
const payload=(quarter=4,ids=[1,2])=>({year:2026,quarter,data:ids.map(id=>show(id,'2026-'+String((quarter-1)*3+1).padStart(2,'0')+'-01'))});
for(let q=1;q<=4;q++){const range=feature.featureRange(2026,q);assert.equal(range.start,'2026-'+String((q-1)*3+1).padStart(2,'0')+'-01');assert.equal(range.end,q===4?'2027-01-01':'2026-'+String(q*3+1).padStart(2,'0')+'-01');}
for(const args of [[2026,0],[2026,5],[2026,1.5],[NaN,1],[1899,1]])assert.throws(()=>feature.featureRange(...args));
assert.equal(feature.featureToday(new Date('2026-03-31T16:30:00Z')),'2026-04-01','quarter boundaries follow Beijing time');
const candidates=[show(1,'2026-10-02',5),show(2,'2026-10-01',9.9),show(1),show(3,'2026-09-30'),show(4,'2027-01-01'),show(5,'2026-10-29'),show(6,'2026-10-32'),show(7,''),{...show(8),nsfw:true},{...show(9),type:1}];
assert.deepEqual(plain(feature.featureSubjects(candidates,2026,4).map(s=>s.id)),[1,2],'keep upstream popularity order; never sort by rating or include future/wrong-quarter/invalid/NSFW/non-animation entries');
assert.equal(feature.featureSubjects(Array.from({length:20},(_,i)=>show(i+1)),2026,4).length,6);
assert.throws(()=>feature.featureData(payload(3),2026,4),/季度/);assert.throws(()=>feature.featureData({...payload(),data:[show(1,'2026-09-01')]},2026,4),/无效/);

const storage=new Map(),cache=()=>load('lib/home-feature-cache.ts',{'./home-feature':feature,'./personal-data':{readStorage:key=>storage.get(key),writeStorage:(key,value)=>storage.set(key,value)}});
let saved=cache();saved.saveFeatureCache(feature.featureData(payload(),2026,4));assert.equal(saved.readFeatureCache(2026,4).data[0].id,1);assert.equal(saved.readFeatureCache(2026,3),undefined);assert.equal(saved.featureCacheFresh(saved.readFeatureCache(2026,4)),true);
saved.saveFeatureCache({...payload(),cacheStale:false,data:[show(8,'2026-07-01')]});assert.equal(saved.readFeatureCache(2026,4).data[0].id,1,'bad data cannot replace a cached quarter');
for(let y=2020;y<2026;y++)saved.saveFeatureCache({year:y,quarter:1,data:[show(y,y+'-01-01')],cacheStale:false});assert.equal(Object.keys(JSON.parse(storage.get('kw-home-features-v1'))).length,4);
storage.set('kw-home-features-v1','bad JSON');assert.equal(cache().readFeatureCache(2026,4),undefined);assert.equal(saved.featureCacheFresh({savedAt:Clock.now(),cacheStale:true}),false);

const server=load('lib/catalog-server.ts',{'./catalog':catalog,'./home-feature':feature,'./search-query':{},'./search-filters':{},'./catalog-snapshot.json':{data:[]}});
(async()=>{
 let request;const result=await server.seasonFeatures(2026,4,async(url,options)=>{request={url,body:JSON.parse(options.body)};return {data:candidates};});assert.deepEqual(plain(result.data.map(s=>s.id)),[1,2]);assert.equal(new URL(request.url).searchParams.get('limit'),'20');assert.equal(request.body.sort,'heat');assert.deepEqual(request.body.filter.air_date,['>=2026-10-01','<2027-01-01','<=2026-10-28']);assert.deepEqual(request.body.filter.type,[2]);assert.equal(request.body.filter.nsfw,false);
 const source=fs.readFileSync('app/api/[...path]/route.ts','utf8'),imports=[...source.matchAll(/from '([^']+)'/g)].map(match=>match[1]),deps=Object.fromEntries(imports.map(name=>[name,{}])),keys=[];
 Object.assign(deps,{'../../../lib/catalog-server':server,'../../../lib/home-feature':feature,'../../../lib/catalog':catalog,'../../../lib/playback-server':{boundedText:r=>r.text()},'../../../lib/server-cache':{cachedJson:async(kind,key,fn,options)=>{keys.push({kind,key,options});return Response.json(await fn());}}});
 let requests=0;const route=load('app/api/[...path]/route.ts',deps,{fetch:async()=>{requests++;return Response.json({data:candidates});}});
 assert.equal((await route.GET(new Request('https://site.example/api/catalog?mode=featured&year=2026&quarter=5'))).status,400);assert.equal(requests,0);
 const response=await route.GET(new Request('https://site.example/api/catalog?mode=featured&year=2026&quarter=4'));assert.equal(response.status,200);assert.deepEqual((await response.json()).data.map(s=>s.id),[1,2]);assert.equal(keys[0].kind,'home-feature');assert.match(keys[0].key,/2026:4:2026-10-28/);assert.equal(keys[0].options.ttl,3600000);
 await component();
 console.log('PASS: seasonal popularity/date and NSFW bounds; six-entry cap; cache isolation/expiry; production endpoint; late-quarter cancellation; rotation, hover/focus/visibility/reduced-motion/manual pause and real subject callbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});

function mount(){
 const slots=[],effects=[],requests=[],timers=new Map(),events=new Map(),mediaEvents=new Map();let cursor=0,dirty=false,tree,stopped=false,nextTimer=0;
 const schedule=()=>{if(dirty||stopped)return;dirty=true;queueMicrotask(()=>{dirty=false;if(!stopped)render();});};
 const react={useState(initial){const n=cursor++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return [slots[n].value,next=>{const value=typeof next==='function'?next(slots[n].value):next;if(!Object.is(value,slots[n].value)){slots[n].value=value;schedule();}}];},useEffect(fn,deps){const n=cursor++,old=slots[n];if(!old||deps.some((v,i)=>v!==old.deps[i])){slots[n]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[n].cleanup?.();slots[n].cleanup=fn();});}}};react.useLayoutEffect=react.useEffect;
 const document={hidden:false,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)},media={matches:false,addEventListener:(key,fn)=>mediaEvents.set(key,fn),removeEventListener:key=>mediaEvents.delete(key)};
 const jsx=(type,props)=>({type,props}),opened=[];
 const Component=load('components/HomeFeatures.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'./AnimeCover':{},'../lib/catalog':catalog,'../lib/bangumi-rating':load('lib/bangumi-rating.ts'),'../lib/home-feature':feature,'../lib/home-feature-cache':{readFeatureCache(){},saveFeatureCache(){},featureCacheFresh:()=>false},'../lib/cover-url':{coverUrl:src=>src},'../lib/request-client':{requestJson:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),anySignal:signals=>signals[0],timeoutSignal:()=>new AbortController().signal}},{document,window:{matchMedia:()=>media},Image:class{},setTimeout:(fn,ms)=>{assert.equal(ms,8000);timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)}).default;
 function render(){cursor=0;tree=Component({onOpen:s=>opened.push(s.id),onToggle(){},isSaved:()=>false});effects.splice(0).forEach(fn=>fn());}
 const nodes=()=>{const all=[],visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;all.push(n);visit(n.props?.children);};visit(tree);return all;};
 const find=label=>nodes().find(n=>n.props?.['aria-label']===label),slide=()=>nodes().find(n=>n.props?.['aria-roledescription']==='幻灯片')?.props['aria-label'];render();return {requests,timers,document,media,events,mediaEvents,opened,nodes,find,slide,section:()=>tree,stop(){stopped=true;slots.forEach(s=>s?.cleanup?.());}};
}
async function component(){
 const app=mount();await tick();assert.equal(app.requests.length,1);const old=app.requests[0];app.find('推荐季度').props.onChange({target:{value:'2'}});await tick();assert.equal(old.options.signal.aborted,true);old.resolve(payload(4,[88]));await tick();assert.equal(app.slide(),undefined,'a slow old quarter cannot be relabeled or rendered');app.requests.at(-1).resolve(payload(2,[10,20]));await tick();assert.match(app.slide(),/2026 年春季.*Show 10/);assert.equal(app.timers.size,1);
 let timer=[...app.timers.values()][0];app.timers.clear();timer();await tick();assert.match(app.slide(),/Show 20/);
 app.section().props.onMouseEnter();await tick();assert.equal(app.timers.size,0);app.section().props.onMouseLeave();await tick();assert.equal(app.timers.size,1);
 app.section().props.onFocusCapture();await tick();assert.equal(app.timers.size,0);app.section().props.onBlurCapture({currentTarget:{contains:()=>false},relatedTarget:null});await tick();assert.equal(app.timers.size,1);
 app.document.hidden=true;app.events.get('visibilitychange')();await tick();assert.equal(app.timers.size,0);app.document.hidden=false;app.events.get('visibilitychange')();await tick();assert.equal(app.timers.size,1);
 app.media.matches=true;app.mediaEvents.get('change')();await tick();assert.equal(app.timers.size,0);app.find('开启自动轮换').props.onClick();await tick();assert.equal(app.timers.size,1);app.find('暂停自动轮换').props.onClick();await tick();assert.equal(app.timers.size,0);app.find('下一部推荐').props.onClick();await tick();assert.match(app.slide(),/Show 10/);assert.equal(app.timers.size,0,'manual navigation does not override the pause preference');app.nodes().find(n=>n.type==='button'&&n.props.className==='primary').props.onClick();assert.deepEqual(app.opened,[10]);app.stop();assert.equal(app.events.size,0);assert.equal(app.mediaEvents.size,0);
}
