const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const dependency=require('./check-feature-deps.cjs').dependency,plain=value=>JSON.parse(JSON.stringify(value));
const home=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let runSearch,playbackReport,availabilityExpression;
(function visit(node){if(ts.isFunctionDeclaration(node)){if(node.name?.text==='runSearch')runSearch=node.getText(home);if(node.name?.text==='playbackReport')playbackReport=node.getText(home);}if(ts.isVariableDeclaration(node)&&node.name.getText(home)==='availability')availabilityExpression=node.initializer.getText(home);ts.forEachChild(node,visit);})(home);
const availabilityModule=ts.createSourceFile('source-availability.ts',fs.readFileSync('lib/source-availability.ts','utf8'),ts.ScriptTarget.Latest,true);const projection=availabilityModule.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='episodeAvailability')?.getText(availabilityModule)||'';
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
function searchHarness(){
 const state={advanced:{tags:'旧标签',scoreMin:'10',scoreMax:'10',rankMin:'1',rankMax:'1',dateFrom:'2000-01-01',dateTo:'2000-12-31',weekdays:[7]},category:'3',tag:'旧标签',year:'2000',offset:40},errors=[];
 const context={...dependency('../lib/search-query'),...dependency('../lib/search-filters'),searchHash:dependency('../lib/share-links').searchHash,hideCompleted:false,hideDropped:false,window:{history:{pushState(){}}},location:{origin:'https://site.test',hash:'#discover'},shareInputHash:()=>undefined,markNavigation(){},privatePlaybackRef:{current:true},setQuery:value=>state.query=value,setOffset:value=>state.offset=value,setSort:value=>state.sort=value,setActiveQuery:value=>state.activeQuery=value,setTag:value=>state.tag=value,setCategory:value=>state.category=value,setCatalogYear:value=>state.year=value,setAdvanced:value=>state.advanced=value,setView:value=>state.view=value,setReload(){},setError:value=>errors.push(value),setToast(){}};
 vm.createContext(context);vm.runInContext(compile(runSearch),context);return {context,state,errors};
}
test('a fresh plain title clears all inherited advanced filters',()=>{
 const h=searchHarness();h.context.runSearch('Fate/Zero');assert.deepEqual(plain(h.state.advanced),plain(dependency('../lib/search-filters').emptySearchFilters));assert.equal(h.state.category,'');assert.equal(h.state.tag,'');assert.equal(h.state.year,'');assert.equal(h.state.offset,0);assert.equal(h.state.activeQuery,'Fate/Zero');
 const quoted=searchHarness();quoted.context.runSearch('"ID:INVADED"');assert.equal(quoted.state.activeQuery,'ID:INVADED');assert.equal(quoted.state.advanced.scoreMin,'');
});
test('fresh shortcuts replace old conditions and invalid input keeps the current search',()=>{
 const h=searchHarness();h.context.runSearch("BanG Dream! It's MyGO!!!!! tag:原创 score:7..9");assert.equal(h.state.activeQuery,"BanG Dream! It's MyGO!!!!!");assert.equal(h.state.advanced.tags,'原创');assert.equal(h.state.advanced.scoreMin,'7');assert.equal(h.state.advanced.rankMin,'');assert.deepEqual(plain(h.state.advanced.weekdays),[]);
 const before=plain(h.state);h.context.runSearch('score:9..2');assert.deepEqual(plain(h.state),before);assert.ok(h.errors.length);
 h.context.runSearch('');assert.equal(h.state.advanced.tags,'');assert.equal(h.state.sort,'popular');
});
const road=[{name:'Main',episodes:[{name:'第1集',number:1,url:'https://source.test/1'},{name:'第2集',number:2,url:'https://source.test/2'}]}];
function projected(checks,number){
 const context={exports:{},availabilityRaw:{checks},availabilitySubject:{id:1,name:'Sample'},rules:[],subjectAliases:{},availabilityDeferred:false,player:{number},useSourceAvailability:()=>({checks}),Number,Object};
 vm.createContext(context);vm.runInContext(compile(projection+'\nthis.value='+availabilityExpression),context);return context.value.checks;
}
test('source playback outcomes do not label untested episodes as played or failed',()=>{
 const checks={Played:{state:'playing',message:'第1集已播放',episodeNumber:1,results:[],roads:road,source:'https://source.test/show'},Failed:{state:'episode-error',message:'第2集解码失败',episodeNumber:2,results:[],roads:road,source:'https://source.test/show'},Unavailable:{state:'error',message:'源站暂不可用',results:[]}};
 const one=projected(checks,1);assert.equal(one.Played.state,'playing');assert.equal(one.Failed.state,'found','an episode-2 failure is not an episode-1 failure');assert.equal(one.Unavailable,checks.Unavailable);
 const two=projected(checks,2);assert.equal(two.Played.state,'found','episode 1 does not prove episode 2 has played');assert.equal(two.Failed.state,'episode-error');assert.equal(two.Played.roads,road);assert.equal(two.Played.source,checks.Played.source);assert.doesNotMatch(two.Played.message,/已播放/);assert.equal(checks.Played.state,'playing','projection must not erase episode 1’s cached outcome');
});
test('episode zero, unknown episode numbers and legacy outcomes remain conservative',()=>{
 const checks={Zero:{state:'playing',message:'序章已播放',episodeNumber:0,results:[],roads:road},Legacy:{state:'episode-error',message:'旧的错误',results:[],roads:road},Unknown:{state:'playing',message:'没有分集信息',results:[]}};
 assert.equal(projected(checks,0).Zero.state,'playing');const unknown=projected(checks,undefined);assert.equal(unknown.Zero.state,'found');assert.equal(unknown.Legacy.state,'found');assert.equal(unknown.Unknown.state,'possible','a playback report without a catalogue is not a verified new episode');
});
test('the real playback reporter tags successful and failed outcomes with their episode',()=>{
 const reports=[],context={player:{ruleName:'Source',number:0,episode:'序章'},rules:[{name:'Source'}],availability:{report:(rule,value)=>reports.push(value)},knownEpisodeNumber:dependency('../lib/playback-client').knownEpisodeNumber};vm.createContext(context);vm.runInContext(compile(playbackReport),context);
 context.playbackReport('playing','序章已播放');assert.equal(reports.at(-1).episodeNumber,0);context.player={...context.player,number:2};context.playbackReport('episode-error','第2集失败');assert.equal(reports.at(-1).episodeNumber,2);assert.equal(reports.at(-1).state,'episode-error');
});
(async()=>{let failures=0;for(const [name,run] of tests){try{await run();console.log('PASS: '+name);}catch(error){failures++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failures)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
