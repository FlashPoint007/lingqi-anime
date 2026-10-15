const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const root=require('node:path').resolve(__dirname,'..')+'/';
// Exercise the production retry handler with direct, enabled and removed sources.
const home=ts.createSourceFile('page.tsx',fs.readFileSync(root+'app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let retry;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='retryPlayback')retry=node.getText(home);ts.forEachChild(node,visit);};visit(home);assert.ok(retry);
const calls=[];const context={player:{subject:{id:1},episode:'First',sourceUrl:'https://example.com/clip.mp4'},chapterSource:'',playerProgress:{current:48},rules:[{name:'unrelated',enabled:true}],start:(...args)=>calls.push(['direct',...args]),resolveSource:(...args)=>calls.push(['source',...args]),setPlayError:message=>calls.push(['error',message])};
vm.createContext(context);vm.runInContext(ts.transpileModule(retry,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';retryPlayback();',context);
assert.equal(calls[0][0],'direct');assert.equal(calls[0][3],48);
context.player.ruleName='saved';context.rules.push({name:'saved',enabled:true});vm.runInContext('retryPlayback()',context);assert.equal(calls[1][0],'source');assert.equal(calls[1][3].name,'saved');assert.equal(calls[1][4],48);
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
