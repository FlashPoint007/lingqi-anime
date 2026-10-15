const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const root=require('node:path').resolve(__dirname,'..')+'/';
// Exercise the production retry handler with direct, enabled and removed sources.
const home=ts.createSourceFile('page.tsx',fs.readFileSync(root+'app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let retry;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='retryPlayback')retry=node.getText(home);ts.forEachChild(node,visit);};visit(home);assert.ok(retry);
const calls=[];const context={player:{subject:{id:1},episode:'First',sourceUrl:'https://example.com/clip.mp4'},chapterSource:'',ruleIdx:0,playerProgress:{current:48},rules:[{name:'unrelated',enabled:true}],start:(...args)=>calls.push(['direct',...args]),resolveSource:(...args)=>calls.push(['source',...args]),setPlayError:message=>calls.push(['error',message])};
vm.createContext(context);vm.runInContext(ts.transpileModule(retry,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';retryPlayback();',context);
assert.equal(calls[0][0],'direct');assert.equal(calls[0][3],48);
context.player.ruleName='saved';context.rules.push({name:'saved',enabled:true});vm.runInContext('retryPlayback()',context);assert.equal(calls[1][0],'source');assert.equal(calls[1][3].name,'saved');assert.equal(calls[1][4],48);
context.player.source='https://example.com/playing';context.chapterSource='https://example.com/other';context.ruleIdx=0;vm.runInContext('retryPlayback()',context);assert.equal(calls.pop()[2].source,'https://example.com/playing');
context.rules[1].enabled=false;vm.runInContext('retryPlayback()',context);assert.equal(calls[2][0],'error');
// Loaded data with blocked autoplay must not report playback success.
const effects=[];const jsx=(type,props)=>({type,props});let confirmed=0;const progress=[];
const fakeReact={useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)};
const playerContext={exports:{},require:name=>name==='react'?fakeReact:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='lucide-react'?new Proxy({},{get:()=>()=>null}):{},setTimeout:()=>1,clearTimeout:()=>{},localStorage:{getItem:()=>null}};
vm.createContext(playerContext);vm.runInContext(ts.transpileModule(fs.readFileSync(root+'components/Player.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,playerContext);
const tree=playerContext.exports.default({url:'https://example.com/clip.mp4',position:48,onTime:(time,flush)=>progress.push({time,flush}),onError:()=>{},onReady:()=>confirmed++});
const find=(node,type)=>{if(!node||typeof node!=='object')return; if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,type);if(result)return result;}};
const video=find(tree,'video'),events={};assert.ok(video);
video.props.ref.current={addEventListener:(name,fn)=>events[name]=fn,canPlayType:()=>'',play:()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})),readyState:2,duration:120,currentTime:0};effects[0]();video.props.onPause();assert.equal(progress.length,0);video.props.onTimeUpdate({currentTarget:video.props.ref.current});events.loadedmetadata();assert.equal(video.props.ref.current.currentTime,48,'loading reset erased saved resume position');events.loadeddata();assert.equal(progress.length,0);video.props.ref.current.currentTime=0;video.props.onTimeUpdate({currentTarget:video.props.ref.current});assert.equal(progress.length,0);video.props.ref.current.currentTime=48;video.props.onSeeked();video.props.ref.current.currentTime=49;video.props.onTimeUpdate({currentTarget:video.props.ref.current});video.props.onPause();assert.equal(progress.at(-1).time,49);assert.equal(progress.at(-1).flush,true);assert.equal(confirmed,0);video.props.onPlaying();video.props.onPlaying();assert.equal(confirmed,1);
console.log('PASS: direct/source retry, disabled-source handling, resume position during loading, autoplay rejection, once-only confirmation');
// Exercise the real WatchPage callbacks with descending and incomplete source catalogues.
const clientContext={exports:{}};vm.createContext(clientContext);vm.runInContext(ts.transpileModule(fs.readFileSync(root+'lib/playback-client.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,clientContext);
const watchSource=ts.transpileModule(fs.readFileSync(root+'components/WatchPage.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const renderWatch=props=>{let stateIndex=0;const context={exports:{},require:name=>name==='react'?{useState:value=>[stateIndex++===1?true:value,()=>{}],useEffect:()=>{},useMemo:fn=>fn()}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('playback-client')?clientContext.exports:name.includes('source-availability')?{availabilityLabels:{}}:name==='lucide-react'?new Proxy({},{get:()=>()=>null}):{default:'TestPlayer'}};vm.createContext(context);vm.runInContext(watchSource,context);return context.exports.default(props);};
const actions=[];const reversed=[3,2,1].map(number=>({name:'第'+number+'集',url:'https://example.com/'+number}));
const props={player:{subject:{id:1,name:'Example',eps:3},episode:'Second',url:'/media',sourceUrl:'https://example.com/2',number:2,position:0},mode:'video',error:'',status:'',rules:[],ruleIdx:-1,query:'',busy:false,sourceError:'This source does not contain this episode',results:[],roads:[{name:'Main',episodes:reversed}],road:0,episodes:[1,2,3].map(sort=>({id:sort,sort,name:''})),checks:{},onPlay:episode=>actions.push(episode.number),onAuto:number=>actions.push(number),onTime:()=>{}};
const textOf=node=>typeof node==='string'?node:Array.isArray(node)?node.map(textOf).join(''):node&&typeof node==='object'?textOf(node.props?.children):'';
const findButton=(node,label)=>{if(!node||typeof node!=='object')return;if(node.type==='button'&&textOf(node).trim()===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=findButton(child,label);if(found)return found;}};
let watch=renderWatch(props);findButton(watch,'下一集').props.onClick();assert.equal(actions.pop(),3);findButton(watch,'上一集').props.onClick();assert.equal(actions.pop(),1);
watch=renderWatch({...props,player:{...props.player,sourceUrl:'https://example.com/1',number:1},roads:[{name:'Incomplete',episodes:[reversed[2],reversed[0]]}]});findButton(watch,'下一集').props.onClick();assert.equal(actions.pop(),2);find(watch,'TestPlayer').props.onEnded();assert.equal(actions.pop(),2);
const sidebar=find(watch,'aside');assert.ok([sidebar.props.children].flat(Infinity).some(node=>node?.type==='p'&&node.props.role==='alert'));
console.log('PASS: reversed episode controls, cross-source next episode and autoplay, visible source errors');
// Deterministic media failures: run the actual player with controllable promises and timers.
(async()=>{
 const source=ts.transpileModule(fs.readFileSync(root+'components/Player.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const setup=({reject,fallback=false,hls=false}={})=>{
  const effects=[],timers=new Map(),errors=[],states=[];let id=0;
  const context={exports:{},require:name=>name==='react'?{useState:value=>{const index=states.length;states.push(value);return [value,n=>states[index]=n];},useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='hls.js'?{default:{isSupported:()=>false}}:name==='lucide-react'?new Proxy({},{get:()=>()=>null}):{},setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>null}};
  vm.createContext(context);vm.runInContext(source,context);
  const tree=context.exports.default({url:'https://example.com/clip.'+(hls?'m3u8':'mp4'),fallbackUrl:fallback?'https://example.com/backup.mp4':undefined,position:0,onTime:()=>{},onError:message=>errors.push(message)}),node=find(tree,'video'),events={};
  const v={paused:false,ended:false,readyState:2,duration:120,currentTime:30,play:()=>reject?reject():Promise.resolve(),pause:()=>{v.paused=true;},load:()=>{},removeAttribute:()=>{},addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name],canPlayType:()=>''};
  node.props.ref.current=v;const cleanup=effects[0]();
  const fire=delay=>{for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}};
  return {node,v,events,errors,states,timers,cleanup,fire};
 };
 const rejected=setup({reject:()=>Promise.reject(Object.assign(new Error(),{name:'NotSupportedError'}))});rejected.events.loadeddata();await Promise.resolve();assert.equal(rejected.errors.length,1,'play rejection must expose retry');rejected.node.props.onError();assert.equal(rejected.errors.length,1,'one failure per attempt');
 const fallback=setup({fallback:true,reject:()=>Promise.reject(Object.assign(new Error(),{name:'NotSupportedError'}))});fallback.events.loadeddata();await Promise.resolve();assert.equal(fallback.states[0],'https://example.com/backup.mp4');assert.equal(fallback.errors.length,0);
 let rejectOld;const stale=setup({reject:()=>new Promise((_,reject)=>rejectOld=reject)});stale.events.loadeddata();stale.cleanup();rejectOld(Object.assign(new Error(),{name:'NotSupportedError'}));await Promise.resolve();assert.equal(stale.errors.length,0,'old playback promise must be ignored after cleanup');
 const started=setup();started.events.loadeddata();await Promise.resolve();started.v.readyState=1;started.fire(12000);assert.equal(started.errors.length,0,'startup timer must stop after loaded data, including later seeks');
 const stalled=setup();stalled.node.props.onWaiting();stalled.fire(20000);assert.equal(stalled.errors.length,1,'a later buffer stall must expose retry');
 const resumed=setup();resumed.node.props.onWaiting();resumed.node.props.onPlaying();resumed.fire(20000);assert.equal(resumed.errors.length,0);
 const paused=setup();paused.node.props.onWaiting();paused.v.paused=true;paused.node.props.onPause();paused.fire(20000);assert.equal(paused.errors.length,0,'pausing during buffering must cancel timeout');
 const progressing=setup();progressing.node.props.onWaiting();progressing.v.readyState=3;progressing.node.props.onTimeUpdate({currentTarget:progressing.v});progressing.fire(20000);assert.equal(progressing.errors.length,0);
 const unsupported=setup({hls:true,fallback:true});await Promise.resolve();await Promise.resolve();assert.equal(unsupported.states[0],'https://example.com/backup.mp4','unsupported HLS must try the available fallback');assert.equal(unsupported.errors.length,0);
 console.log('PASS: play rejection recovery, fallback, stale promises, buffer timeout, pause/resume/progress cancellation, unsupported HLS fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
// Resolve real production handlers: one broken road must not discard healthy sibling roads.
(async()=>{
 const handler=name=>{let code;const walk=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)code=node.getText(home);ts.forEachChild(node,walk);};walk(home);assert.ok(code,name);return ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;};
 const subject={id:9,name:'Example',eps:12},rule={name:'Test',enabled:true},roads=[{name:'Broken',episodes:[{name:'第2集',url:'https://example.com/broken'}]},{name:'Healthy',episodes:[{name:'第2集',url:'https://example.com/healthy'}]}];
 const requests=[],remembered=[],states={};
 const context={AbortController,AbortSignal,anySignal:signals=>AbortSignal.any(signals),timeoutSignal:ms=>AbortSignal.timeout(ms),Date,JSON,player:null,playerProgress:{current:0},lastProgress:{current:0},playbackId:{current:1},ruleIdx:0,rules:[rule],roads,roadsRef:{current:roads},availability:{checks:{Test:{state:'found',checkedAt:Date.now(),source:'https://example.com/catalog',roads,results:[]}},report:()=>{}},resumeEpisodePosition:clientContext.exports.resumeEpisodePosition,episodeAtNumber:clientContext.exports.episodeAtNumber,episodeNumber:clientContext.exports.episodeNumber,saveProgress:()=>{},beginPlayback:()=>({id:1,controller:new AbortController()}),stopSource:()=>{},ruleCompatibility:()=>'',readStorage:()=>null,remember:(...args)=>remembered.push(args),api:async(_,options)=>{const body=JSON.parse(options.body);requests.push(body.url);if(body.url.endsWith('broken'))throw Error('source 404');return {mode:'video',verified:true,url:'/media',mediaUrl:'https://example.com/clip.mp4'};}};
 for(const name of ['setPlayError','setPlayMode','setPlayer','setResolveStatus','setRuleIdx','setSourceResults','setRoads','setActiveRoad','setChapterSource'])context[name]=value=>states[name]=value;
 vm.createContext(context);vm.runInContext(handler('playEpisode')+'\nthis.run=playEpisode;',context);await context.run(subject,2);
 assert.deepEqual(requests,roads.map(line=>line.episodes[0].url));assert.equal(states.setPlayMode,'video');assert.equal(states.setPlayer.number,2);assert.equal(states.setActiveRoad,1);assert.equal(remembered[0][1].number,2);
 // Manual road fallback also retains episode identity and resume position.
 requests.length=0;remembered.length=0;context.playerProgress.current=41;vm.runInContext(handler('resolveSource')+'\nthis.resolve=resolveSource;',context);await context.resolve(subject,{...roads[0].episodes[0],number:2,source:'https://example.com/catalog'},rule,41,roads);
 assert.equal(states.setPlayer.number,2,'alternate road lost the episode number');assert.equal(states.setPlayer.position,41);assert.equal(remembered[0][1].number,2);
 // A new source detail request clears obsolete episodes before any network result.
 let rejectDetail;context.rules=[rule];context.sourceOperation={current:1};context.sourceRequestRef={current:null};context.api=()=>new Promise((_,reject)=>rejectDetail=reject);context.stopSource=()=>{context.sourceOperation.current++;};context.setSourceBusy=value=>states.busy=value;context.setSourceError=value=>states.error=value;
 vm.runInContext(handler('sourceChapters')+'\nthis.chapters=sourceChapters;',context);states.setRoads=roads;states.setChapterSource='https://example.com/old';const pending=context.chapters('https://example.com/new');assert.equal(states.setRoads.length,0);assert.equal(states.setChapterSource,'');rejectDetail(Error('source 404'));await pending;assert.equal(states.setRoads.length,0);assert.match(states.error,/404/);assert.equal(states.busy,false);
 console.log('PASS: automatic sibling-road retry, manual fallback episode identity/resume, stale chapter clearing on failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
