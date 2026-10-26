const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const home=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};let detailEffect,startDisabled,probeDeferred;
(function visit(n){
 if(ts.isFunctionDeclaration(n)&&n.name)parts[n.name.text]=n.getText(home);
 if(ts.isVariableDeclaration(n)&&n.name.getText(home)==='availabilityDeferred')probeDeferred=n.initializer.getText(home);
 if(ts.isCallExpression(n)&&n.expression.getText(home)==='useEffect'&&n.arguments[0]?.getText(home).includes('Promise.allSettled'))detailEffect=n.arguments[0].getText(home);
 if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(home)==='button'&&n.children.some(c=>ts.isJsxText(c)&&c.text.includes('开始观看')))startDisabled=n.openingElement.attributes.properties.find(a=>a.name?.text==='disabled').initializer.expression.getText(home);
 ts.forEachChild(n,visit);
})(home);
const playback={exports:{},URL};vm.runInNewContext(compile(fs.readFileSync('lib/playback-client.ts','utf8')),playback);const core=playback.exports;
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));},plain=v=>JSON.parse(JSON.stringify(v));
function execute(code,values){const c={URL,Date,AbortController,AbortSignal,Error,console,...require('./check-feature-deps.cjs').dependency('../lib/source-identity'),...values};vm.createContext(c);vm.runInContext(compile(code),c);return c;}
const current={id:2,name:'A ten-episode show',eps:10},previous={id:1,name:'An unrelated sequel'},rule={name:'A',baseURL:'https://source.test/',enabled:true};
const localRoads=[{name:'Line',episodes:Array.from({length:10},(_,i)=>({name:'第'+(i+1)+'集',url:'https://source.test/ep/'+(i+1)}))}];
function chapters(subject=previous,fetcher=async()=>({roads:localRoads})){
 const writes=[],reports=[],operation={current:0};
 const ctx=execute(parts.sourceChapters,{player:null,selected:subject,episodes:Array.from({length:10},(_,i)=>({sort:29+i})),rules:[rule],ruleIdx:0,sourceOperation:operation,sourceRequestRef:{current:null},stopSource(){operation.current++;},setSourceBusy(){},setSourceError(){},setChapterSource(){},setActiveRoad(){},setRoads:v=>writes.push(v),sourceResults:[],alignEpisodeNumbers:core.alignEpisodeNumbers,matchesTitle:()=>true,title:s=>s.name,availability:{report:(...args)=>reports.push(args)},anySignal:AbortSignal.any,timeoutSignal:()=>new AbortController().signal,api:fetcher});
 return {ctx,writes,operation,reports};
}
function start(rules=[rule]){
 const automatic=[],chapters=[],resolved=[],errors=[],remembered=[];let selectedValue;
 const ctx=execute(parts.start,{playResume:true,rules,ruleIdx:0,player:null,selected:previous,roads:[],knownEpisodeNumber:core.knownEpisodeNumber,ruleForPlayback:core.ruleForPlayback,stopSource(){},stopPlayback(){},setPlayError:v=>errors.push(v),setSourceTerm(){},setEpisodes(){},setSelected:v=>selectedValue=v,setRoads(){},setSourceResults(){},setChapterSource(){},setRuleIdx(){},title:s=>s.name,sourceChapters:(...args)=>chapters.push(args),resolveSource:(...args)=>resolved.push(args),playEpisode:(...args)=>automatic.push(args),setPlayMode(){},setPlayer(){},setDirect(){},remember:(...args)=>remembered.push(args),playerProgress:{current:0},lastProgress:{current:0}});
 return {ctx,automatic,chapters,resolved,errors,remembered,selected:()=>selectedValue};
}
const tests=[];function test(name,run){tests.push([name,run]);}
test('resume chapters never borrow another anime’s sequel numbering',async()=>{
 const h=chapters();await h.ctx.sourceChapters('https://source.test/show',rule,'https://source.test/ep/1',current);
 assert.deepEqual(plain(h.writes.at(-1)[0].episodes.map(e=>e.number||core.episodeNumber(e,0))),[1,2,3,4,5,6,7,8,9,10]);
 const same=chapters(previous);await same.ctx.sourceChapters('https://source.test/show',rule,'',previous);assert.equal(same.writes.at(-1)[0].episodes[0].number,29,'same-anime global numbering still aligns');
 let finish;const stale=chapters(previous,()=>new Promise(resolve=>finish=resolve));const request=stale.ctx.sourceChapters('https://source.test/show',rule,'',current);stale.operation.current++;finish({roads:localRoads});await request;assert.ok(!stale.writes.some(rows=>rows.length),'a superseded request cannot restore old chapters');
});
test('the real resume entry point passes its target anime to chapter loading',()=>{
 const h=start();h.ctx.start(current,{name:'第1集',number:1,url:'https://source.test/ep/1',source:'https://source.test/show'},45,'A');
 assert.equal(h.chapters[0][3]?.id,current.id);assert.equal(h.resolved[0][3],45);assert.equal(h.selected().id,current.id);
});
test('ambiguous saved HD records validate their catalogue before resuming',async()=>{
 const h=start(),target={id:259,name:'夏目友人帐',eps:13,platform:'TV'},episode={name:'HD国语版',number:1,url:'https://source.test/movie-play',source:'https://source.test/movie'};
 h.ctx.start(target,episode,224,'A');assert.equal(h.chapters.length,0,'verification owns the catalogue request instead of racing a second read');assert.equal(h.resolved[0][5],true,'a canonical episode number does not prove an unnumbered HD movie is an episode');
 const recovered=[],players=[];const context=execute(parts.resolveSource,{...core,recovery:{current:{begin(){},remaining:()=>90000}},roads:[],playerProgress:{current:224},lastProgress:{current:0},playbackId:{current:1},beginPlayback:()=>({id:1,controller:new AbortController()}),setSourceError(){},setPlayError(){},setPlayMode(){},setPlayer:value=>players.push(value),setRoads(){},setChapterSource(){},setActiveRoad(){},setResolveStatus(){},selected:target,episodes:[],anySignal:AbortSignal.any,timeoutSignal:()=>new AbortController().signal,playEpisode:(...args)=>recovered.push(args),api:async()=>({roads:[{name:'电影',episodes:[{name:'HD国语版',url:episode.url}]}]})});
 await context.resolveSource(target,episode,rule,224,[],true);assert.equal(recovered.length,1);assert.equal(recovered[0][3],true,'a proven catalogue mismatch must restart the correct episode rather than carry movie progress');assert.ok(players.every(player=>!player.url),'the wrong movie is never mounted while validating history');
});
test('replacing a proven mismatched movie resets only that episode’s progress',()=>{
 const target={id:259,name:'夏目友人帐',eps:13},historyRef={current:[{subject:target,number:1,position:224,progresses:{'1':{position:224,duration:300,updatedAt:1,completed:true},'2':{position:40,duration:1440,updatedAt:1,completed:false}}}]};
 const context=execute(parts.remember,{personal:{ready:true},privatePlaybackRef:{current:false},historyRef,withEpisodeProgress:require('./check-feature-deps.cjs').dependency('../lib/episode-progress').withEpisodeProgress,setHistory(){}});context.remember(target,{name:'第1集',number:1,url:'https://source.test/tv/1'},0,'Test',true);assert.equal(historyRef.current[0].progresses['1'].position,0);assert.equal(historyRef.current[0].progresses['1'].completed,false);assert.equal(historyRef.current[0].progresses['2'].position,40);
});
test('disabled/removed/rehosted history sources recover the known episode',()=>{
 for(const rules of [[{...rule,enabled:false}],[],[{...rule,baseURL:'https://new-source.test/'}]]){
  const h=start(rules);h.ctx.start(current,{name:'第2集',number:2,url:'https://source.test/ep/2',source:'https://source.test/show'},174,'A');
  assert.equal(h.automatic.length,1,'resume should enter automatic source discovery');assert.equal(h.automatic[0][0].id,current.id);assert.equal(h.automatic[0][1],2);assert.equal(h.resolved.length,0);
 }
 const zero=start([]);zero.ctx.start(current,{name:'第0集',url:'https://source.test/ep/0'},25,'A');assert.equal(zero.automatic[0][1],0,'prologues retain episode zero');
 const unknown=start([]);unknown.ctx.start(current,{name:'先导预告',url:'https://source.test/trailer'},0,'A');assert.equal(unknown.automatic.length,0,'unknown episodes are not guessed');assert.ok(unknown.errors.at(-1));
 const custom=start([]);custom.ctx.start(current,{name:'Custom',url:'https://video.test/movie.mp4'},15);assert.equal(custom.automatic.length,0);assert.equal(custom.remembered.length,1,'direct video playback remains direct');
});
test('real history recovery preserves position and resolves global sequel numbers',async()=>{
 for(const number of [2,29]){
  const target={...current,id:20+number},fresh={name:'Fresh',baseURL:'https://fresh.test/',enabled:true},h=start([{...rule,enabled:false},fresh]),players=[],requests=[];
  const episode={name:'第'+number+'集',url:'https://source.test/ep/'+number,source:'https://source.test/show',number},progress={position:174,duration:1440,completed:false,updatedAt:Date.now()};
  const recovery={exports:{}};vm.runInNewContext(compile(fs.readFileSync('lib/playback-recovery.ts','utf8')),recovery);
  const freshRoads=localRoads.map(road=>({...road,episodes:road.episodes.map(e=>({...e,url:e.url.replace('source.test','fresh.test')}))}));
  Object.assign(h.ctx,{recovery:{current:recovery.exports.createPlaybackRecovery()},historyRef:{current:[{subject:target,number,position:174,progresses:{[number]:progress}}]},episodes:[{sort:99}],playbackId:{current:1},playbackRequest:{current:null},roadsRef:{current:[]},sourceBusy:false,subjectAliases:{},ruleCompatibility:()=>'',readStorage:()=>null,searchNames:s=>[s.name],beginPlayback:()=>({id:1,controller:new AbortController()}),saveProgress(){},setResolveStatus(){},setActiveRoad(){},setSourceError(){},setPlayer:p=>players.push(p),anySignal:AbortSignal.any,timeoutSignal:()=>new AbortController().signal,alignEpisodeNumbers:core.alignEpisodeNumbers,resumeEpisodePosition:core.resumeEpisodePosition,episodeAtNumber:core.episodeAtNumber,availability:{checks:{},report(){}},checkSource:async()=>({state:'found',source:'https://fresh.test/show',results:[],roads:freshRoads}),api:async(url,options)=>{requests.push(url);if(url.startsWith('/api/episodes'))return {data:Array.from({length:10},(_,i)=>({sort:29+i}))};const body=JSON.parse(options.body);assert.equal(body.url,'https://fresh.test/ep/'+(number===29?1:2));return {mode:'video',verified:true,url:'https://cdn.test/clip.mp4',mediaUrl:'https://cdn.test/clip.mp4'};}});
  vm.runInContext(compile(parts.episodeResume+'\n'+parts.playEpisode),h.ctx);h.ctx.start(target,episode,174,'A');await tick();
  assert.equal(players.at(-1).number,number);assert.equal(players.at(-1).position,174);assert.equal(players.at(-1).ruleName,'Fresh');assert.equal(h.remembered.at(-1)[2],174);assert.equal(requests.some(url=>url.startsWith('/api/episodes')),number===29,'only missing/global numbering needs an extra metadata read');
 }
});
test('a ready episode catalogue is playable while subject metadata is slow',async()=>{
 let finishSubject;const c=execute('this.effect='+detailEffect,{selected:current,player:null,rules:[rule],detailLoading:false,episodes:[],sourceOperation:{current:0},title:s=>s.name,stopSource(){},setSourceTerm(){},setSourceResults(){},setRoads(){},setSourceError(){},setRuleIdx(){},setDetailError(){},setSelected(){},setDetailLoading:v=>c.detailLoading=v,setEpisodes:v=>c.episodes=v,anySignal:AbortSignal.any,timeoutSignal:()=>new AbortController().signal,api:url=>url.startsWith('/api/subject')?new Promise(resolve=>finishSubject=resolve):Promise.resolve({data:[{id:201,sort:1,name:'First episode'}],total:1})});
 const evaluate=()=>vm.runInContext(compile('this.availabilityDeferred='+probeDeferred+';this.disabled='+startDisabled),c);
 const cleanup=c.effect();await tick();assert.equal(c.detailLoading,true);assert.equal(c.episodes.length,1);evaluate();assert.equal(c.disabled,false,'a known episode count must not wait for slower subject metadata');
 c.selected={id:current.id,name:current.name};evaluate();assert.equal(c.disabled,true,'completely missing matching metadata waits instead of guessing a same-name movie');c.selected={...current,eps:undefined,platform:'TV'};evaluate();assert.equal(c.disabled,false,'known platform metadata can also start a loaded episode');
 finishSubject(current);await tick();assert.equal(c.detailLoading,false);c.episodes=[];evaluate();assert.equal(c.disabled,true,'an empty catalogue cannot start an unknown episode');cleanup();
});
(async()=>{let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
