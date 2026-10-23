const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {webcrypto}=require('node:crypto');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const plain=value=>JSON.parse(JSON.stringify(value)),tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
function load(file,deps={},globals={}){
 const context={exports:{},Request,Response,Headers,URL,URLSearchParams,AbortController,AbortSignal,TextEncoder,TextDecoder,Date,crypto:webcrypto,setTimeout,clearTimeout,console,...globals};
 context.require=name=>{if(name in deps)return deps[name];if(name.startsWith('.')){const next=path.resolve(path.dirname(file),name);return next.endsWith('.json')?JSON.parse(fs.readFileSync(next,'utf8')):load(fs.existsSync(next)?next:next+'.ts',deps,globals);}return require(name);};
 vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),context,{filename:file});return context.exports;
}
function events(extra={}){const handlers=new Map();return {...extra,addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);},removeEventListener(name,fn){handlers.get(name)?.delete(fn);},fire(name,event={}){for(const fn of handlers.get(name)||[])fn(event);}};}
const text=node=>typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(text).join(''):'';
function nodes(tree,type){const found=[];(function walk(n){if(!n||typeof n!=='object')return;if(n.type===type)found.push(n);[n.props?.children].flat(Infinity).forEach(walk);})(tree);return found;}
function discussion(initial){
 const slots=[],effects=[],requests=[];let cursor=0,dirty=true,tree,props=initial;
 const react={useState(value){const i=cursor++;if(!(i in slots))slots[i]={value};return [slots[i].value,next=>{const n=typeof next==='function'?next(slots[i].value):next;if(n!==slots[i].value){slots[i].value=n;dirty=true;}}];},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value});},useEffect(fn,values){const i=cursor++;if(!slots[i]||values.some((v,j)=>v!==slots[i].values[j])){const old=slots[i];slots[i]={values};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props)=>({type,props});
 const component=load('components/Discussions.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/request-client':{requestJson:async url=>{requests.push(url);return {authenticated:true,total:1,posts:[{id:'root',alias:'Reader',body:'A comment',createdAt:1,replyCount:21}]};},anySignal:signals=>signals[0],timeoutSignal:()=>new AbortController().signal}},{localStorage:{getItem:()=>null,setItem(){}}}).default;
 const render=()=>{let turns=0;while(dirty){assert.ok(turns++<20,'discussion render loop');dirty=false;cursor=0;tree=component(props);effects.splice(0).forEach(fn=>fn());}return tree;};render();
 return {render,requests,update(next){props={...props,...next};dirty=true;render();},stop(){slots.forEach(slot=>slot?.cleanup?.());}};
}
(async()=>{
 // Equivalent weekly/season sources may be cached; a broad search fallback may not.
 const catalog=load('lib/catalog-server.ts');
 const fallback=await catalog.seasonCatalog(new URLSearchParams('year=2023&quarter=4'),async(url,options)=>{
  if(url.includes('kazumi.fyi'))throw Error('season outage');
  assert.deepEqual(JSON.parse(options.body).filter.air_date,['>=2023-09-01','<2023-12-01']);
  return {total:1,data:[{id:1,name:'Fallback title',date:'2023-10-02'}]};
 });
 assert.equal(fallback.offline,true);assert.match(fallback.notice,/备用首播/);assert.equal(fallback.basis,'premiere');assert.equal(fallback.calendar[0].items.length,1);
 // Calendar links and dropdowns use the same season and support old archives.
 const share=load('lib/share-links.ts',{'./catalog':{currentSeason:()=>({year:2027,quarter:1})}});
 assert.deepEqual(plain(share.parseShareRoute('#calendar').calendar),{year:2027,quarter:1,day:0});
 const years=load('lib/catalog.ts').catalogYears([],2026,'1999');assert.ok(years.includes(1999));assert.ok(years.includes(2026));
 const home=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let yearOptions;
 (function find(node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>p.name?.text==='aria-label'&&p.initializer?.text==='放送年份')){yearOptions=node.children.find(ts.isJsxExpression)?.expression;}ts.forEachChild(node,find);})(home);
 assert.ok(yearOptions);const rendered=vm.runInNewContext(compile('this.options='+yearOptions.getText(home)),{exports:{},require:()=>({jsx:(_type,p)=>p,jsxs:(_type,p)=>p}),currentSeason:()=>({year:2026,quarter:4}),seasonYear:1999,catalogYears:load('lib/catalog.ts').catalogYears,console});assert.ok(rendered.some(option=>option.value===1999));assert.ok(rendered.some(option=>option.value===2026));
 // Invalid JSON shapes are client errors and never touch the database.
 const db={prepare(){throw Error('bad JSON must not access SQL');}},user={userId:'owner',displayName:'Owner'},deps={'cloudflare:workers':{env:{DB:db}},'./email-auth':{getSiteUser:async()=>user},'../app/chatgpt-auth':{getChatGPTUser:async()=>null}};
 const handlers=[load('lib/email-auth.ts',deps).emailAuthResponse,load('lib/library-server.ts',deps).libraryResponse,load('lib/discussion-server.ts',deps).discussionResponse];
 for(const handler of handlers)for(const value of [null,[],false,17,'text']){const response=await handler(new Request('https://site.example/api/test',{method:'POST',headers:{Origin:'https://site.example','Content-Type':'application/json'},body:JSON.stringify(value)}));assert.equal(response.status,400);}
 // An auto-next must preserve a whole-series draft; episode threads reset on a new episode.
 const d=discussion({subjectId:1,episodeNumber:1,episodeId:101});
 nodes(d.render(),'details')[0].props.onToggle({currentTarget:{open:true}});d.render();await tick();d.render();
 const input=()=>nodes(d.render(),'textarea')[0];input().props.onChange({target:{value:'Whole-series draft'}});d.update({episodeNumber:2,episodeId:102});await tick();assert.equal(input().props.value,'Whole-series draft');
 nodes(d.render(),'select')[0].props.onChange({target:{value:'episode'}});d.render();await tick();d.render();
 nodes(d.render(),'button').find(n=>text(n)==='查看全部 21 条回复').props.onClick();d.render();await tick();d.render();assert.ok(d.requests.at(-1).includes('thread=root'));
 d.update({episodeNumber:3,episodeId:103});await tick();d.render();assert.ok(!d.requests.at(-1).includes('thread='));assert.ok(d.requests.at(-1).includes('episode=3'));d.stop();
 // Execute the real offline script against an asynchronous media/storage mock.
 const writes=[],pending=[];let defer=false,owner='anonymous',time=0;
 const video=events({readyState:2,duration:120,seeking:false,currentTime:0,pause(){},load(){},removeAttribute(){this.src='';},canPlayType:()=>'',scrollIntoView(){},play:async()=>{}});
 Object.defineProperty(video,'currentTime',{get:()=>time,set:value=>{time=value;video.seeking=true;}});
 const elements={library:{replaceChildren(){},append(){}},video,message:{textContent:''},retry:events({hidden:true}),playback:{hidden:true},'player-title':{textContent:''}},window=events(),document=events({getElementById:id=>elements[id],createElement:()=>({}),visibilityState:'visible'});
 const context={document,window,navigator:{},location:{hash:''},localStorage:{getItem:key=>key==='kw-library-owner'?JSON.stringify(owner):'false'},console,Date,readOffline:async(_store,id)=>item(id),listOffline:async()=>[],removeOffline:async()=>{},offlineAssetURL:(id,entry)=>'/__offline_media/'+id+'/'+entry,updateOfflineProgress:(id,who,change)=>{writes.push({id,who,change});if(defer)return new Promise(resolve=>pending.push(resolve));return Promise.resolve(undefined);}};
 vm.createContext(context);let source=fs.readFileSync('public/offline-player.js','utf8').replace(/^import[^\n]+\n/,'');source=source.slice(0,source.lastIndexOf('\nvoid initialize();'));vm.runInContext(source,context);const offline=vm.runInContext('({play,save,current:()=>current})',context);
 const item=id=>({id,owner:'anonymous',subject:{name:id},episode:'EP1',position:72,status:'complete',type:'video',entry:'0'});
 await offline.play(item('A'));video.fire('loadedmetadata');assert.equal(video.seeking,true);time=0;await offline.save(true);assert.equal(writes.length,0,'incomplete restore cannot overwrite saved progress');
 time=72;video.seeking=false;video.fire('seeked');await tick();assert.equal(writes[0].change.position,72);
 defer=true;const first=offline.play(item('B')),last=offline.play(item('C'));assert.equal(pending.length,2);pending[1]();await last;pending[0]();await first;assert.equal(offline.current().id,'C','a late previous save cannot replace the newest selection');
 // A pending play must not reopen the old account after a cross-tab sign-out.
 defer=false;video.seeking=false;time=1;video.fire('loadedmetadata');video.seeking=false;video.fire('seeked');await tick();defer=true;
 const leaving=offline.play(item('D'));assert.ok(pending.length===3);owner='different-owner';window.fire('storage',{key:'kw-library-owner'});pending[2]();await leaving;assert.equal(offline.current(),undefined);assert.equal(elements.playback.hidden,true);
 console.log('PASS: degraded season isolation, calendar time zone/archive years, malformed request schemas, discussion draft/thread scoping, offline seek protection and latest-selection/account-change cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
