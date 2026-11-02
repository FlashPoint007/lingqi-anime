const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const tests=[],test=(name,run)=>tests.push([name,run]),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function load(file,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,URL,console,setTimeout,clearTimeout,...globals,require:name=>{if(name in deps)return deps[name];return load(path.resolve(path.dirname(file),name+'.ts'),deps,globals);}},{filename:file});return exports;}
function castFixture(){
 const chosen=deferred(),loads=[],video={src:'https://video.example/one',currentSrc:'https://video.example/one',currentTime:42,paused:false,pause(){this.paused=true;this.pauses++;},pauses:0};let loading;
 const session={loadMedia:request=>{loads.push(request);return loading||Promise.resolve();}},context={requestSession:()=>chosen.promise,getCurrentSession:()=>session,endCurrentSession(){}};
 const window={cast:{framework:{CastContext:{getInstance:()=>context}}},chrome:{cast:{Image:class{constructor(url){this.url=url;}},media:{MediaInfo:class{constructor(url,type){this.contentId=url;this.contentType=type;}},GenericMediaMetadata:class{},LoadRequest:class{constructor(media){this.media=media;}},SeekRequest:class{}}}}};
 const cast=load('lib/casting.ts',{}, {window});
 return {cast,video,chosen,loads,setLoading:p=>loading=p};
}
test('Cast receives the actual show/episode, cover and HLS type for opaque URLs',async()=>{
 const f=castFixture(),metadata={title:'孤独摇滚！',episode:'第 2 集 · 明天见',poster:'https://lain.bgm.tv/cover.jpg',mediaType:'hls'};
 const work=f.cast.castVideo(f.video,'https://media.example/signed?ticket=hls',metadata);metadata.title='Later show';f.chosen.resolve();await work;
 assert.equal(f.loads.length,1);const request=f.loads[0];assert.equal(request.media.contentType,'application/x-mpegURL');assert.equal(request.media.metadata.title,'孤独摇滚！');assert.equal(request.media.metadata.subtitle,'第 2 集 · 明天见');assert.equal(request.media.metadata.images[0].url,'https://lain.bgm.tv/cover.jpg');assert.equal(request.currentTime,42);assert.equal(request.autoplay,true);assert.equal(f.video.pauses,1);
});
test('changing episodes while selecting a device cannot cast or pause the new media',async()=>{
 const f=castFixture();const work=f.cast.castVideo(f.video,f.video.src,{title:'First',mediaType:'video'});f.video.currentSrc=f.video.src='https://video.example/two';f.chosen.resolve();await assert.rejects(work,/切换/);assert.equal(f.loads.length,0);assert.equal(f.video.pauses,0);
 const g=castFixture();let current=true;const next=g.cast.castVideo(g.video,g.video.src,{title:'First'},()=>current);current=false;g.chosen.resolve();await assert.rejects(next,/切换/);assert.equal(g.loads.length,0);
});
test('media changed during receiver loading is not paused when an old load completes',async()=>{
 const f=castFixture(),loading=deferred();f.setLoading(loading.promise);f.chosen.resolve();const work=f.cast.castVideo(f.video,f.video.src,{title:'First'});await new Promise(r=>setImmediate(r));assert.equal(f.loads.length,1);f.video.currentSrc='https://video.example/two';loading.resolve();await assert.rejects(work,/切换/);assert.equal(f.video.pauses,0);
});
test('local-only files are rejected before device selection',async()=>{
 for(const url of ['blob:https://site.example/id','file:///movie.mp4','https://site.example/__offline_media/id/0','https://user:password@video.example/file.mp4']){const f=castFixture();f.chosen.resolve();await assert.rejects(f.cast.castVideo(f.video,url,{title:'Offline'}),/投屏|地址/);assert.equal(f.loads.length,0);assert.equal(f.video.pauses,0);}
});
const jsx=(type,props,key)=>({type,props,key}),text=n=>n==null?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
function nodes(root,type){const out=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;if(n.type===type)out.push(n);visit(n.props?.children);}visit(root);return out;}
test('collection category and layout changes reuse the searched/sorted library',()=>{
 let cursor=0,queries=0;const slots=[],effects=[],react={useState(value){const i=cursor++;if(!slots[i])slots[i]={value};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={value:fn(),deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++;if(!slots[i]){slots[i]={deps};effects.push(fn);}}};
 const query=load('lib/collection-query.ts'),component=load('components/CollectionLibrary.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'./AnimeCover':{default:()=>null},'../lib/collection-query':{collectionResults:(...args)=>{queries++;return query.collectionResults(...args);}}},{localStorage:{getItem:()=>null,setItem(){}}}).default;
 let props={items:[{id:1,name:'First',collectionStatus:'watching'},{id:2,name:'Second',collectionStatus:'completed'},{id:3,name:'Third',collectionStatus:'planned'}],historyCount:1,disabled:false,onOpen(){},onState(){}},tree;
 const render=()=>{cursor=0;tree=component(props);effects.splice(0).forEach(fn=>fn());return tree;},click=label=>{const b=nodes(tree,'button').find(n=>text(n)===label||n.props['aria-label']===label);assert.ok(b,label);b.props.onClick();render();};
 render();assert.equal(queries,1);click('在看 1');assert.equal(nodes(tree,'article').length,1);assert.equal(nodes(tree,'article')[0].key,1);assert.equal(queries,1,'a category switch must not repeat normalization and sorting');click('看过 1');assert.equal(nodes(tree,'article')[0].key,2);assert.equal(queries,1);click('列表布局');assert.equal(queries,1,'default empty aliases keep a stable dependency');nodes(tree,'input')[0].props.onChange({target:{value:'Second'}});render();assert.equal(queries,2);assert.equal(nodes(tree,'article').length,1);click('在看 1');assert.equal(nodes(tree,'article').length,0);assert.equal(queries,2);props={...props,items:[...props.items,{id:4,name:'Second extra',collectionStatus:'watching'}]};render();assert.equal(queries,3);assert.equal(nodes(tree,'article')[0].key,4);
});
test('fallback rules match the current 18-rule upstream index and changed parser modes',()=>{
 const snapshot=JSON.parse(fs.readFileSync('lib/rules-snapshot.json','utf8'));assert.equal(snapshot.revision,'2967d7babafffa92dbf35fbcb69d0fd964139e63');assert.equal(snapshot.entries.length,18);
 const rules=Object.fromEntries(snapshot.entries.map(x=>[x.rule.name,x.rule]));assert.equal(rules.AGE.version,'1.6');assert.equal(rules.mutefun.version,'1.6');assert.equal(rules.mutefun.searchMode,'xpath');assert.equal(rules.TvTFun.version,'1.3');assert.equal(rules.TvTFun.chapterMode,'xpath');assert.equal(rules.TvTFun.chapterResult,'//li/a');const api=load('lib/rule-api.ts');const found=api.apiSearch({data:{items:[{name:'Known show',slug:'known-show'}]}},rules.TvTFun.searchApiConfig,rules.TvTFun);assert.equal(found[0].url,'https://www.tvtfun.net/watch/known-show/1');
});
(async()=>{let failed=0;for(const [name,run]of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})();
