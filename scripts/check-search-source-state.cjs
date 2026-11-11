const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const dependency=require('./check-feature-deps.cjs').dependency,plain=value=>JSON.parse(JSON.stringify(value));
const home=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let runSearch,playbackReport,availabilityExpression,resetFilters,clearSearch,filterNotice,sortControls;
(function visit(node){if(ts.isFunctionDeclaration(node)){if(node.name?.text==='runSearch')runSearch=node.getText(home);if(node.name?.text==='playbackReport')playbackReport=node.getText(home);if(node.name?.text==='resetFilters')resetFilters=node.getText(home);if(node.name?.text==='clearSearch')clearSearch=node.getText(home);}if(ts.isVariableDeclaration(node)&&node.name.getText(home)==='availability')availabilityExpression=node.initializer.getText(home);if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='className'&&p.initializer?.text==='segmented'))sortControls=node.getText(home);if(ts.isJsxExpression(node)&&node.expression&&ts.isBinaryExpression(node.expression)&&node.getText(home).includes('className="active-filters"'))filterNotice=node.expression.getText(home);ts.forEachChild(node,visit);})(home);
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
// Reset executes the real page callbacks, including all personal exclusions and
// batch cursors, then serializes the resulting share route as the page does.
test('reset all filters restores excluded titles and the first batch',()=>{
 const h=searchHarness();Object.assign(h.state,{hideCompleted:true,hideDropped:true,filteredCursors:[0,20],sort:'rank'});
 Object.assign(h.context,{category:h.state.category,setHideCompleted:value=>h.state.hideCompleted=value,setHideDropped:value=>h.state.hideDropped=value,setFilteredCursors:value=>h.state.filteredCursors=value});
 vm.runInContext(compile(clearSearch+'\n'+resetFilters),h.context);h.context.resetFilters();
 assert.equal(h.state.hideCompleted,false);assert.equal(h.state.hideDropped,false);assert.deepEqual(plain(h.state.filteredCursors),[]);assert.equal(h.state.offset,0);assert.equal(h.state.sort,'popular');assert.equal(h.state.activeQuery,'');assert.equal(h.state.tag,'');assert.equal(h.state.category,'');assert.equal(h.state.year,'');assert.deepEqual(plain(h.state.advanced),plain(dependency('../lib/search-filters').emptySearchFilters));
 const links=dependency('../lib/share-links'),route=links.parseShareRoute(links.searchHash({q:h.state.activeQuery,sort:h.state.sort,tag:h.state.tag,category:h.state.category,year:h.state.year,page:1,filters:h.state.advanced,hideCompleted:h.state.hideCompleted,hideDropped:h.state.hideDropped}));
 assert.equal(route.search.hideCompleted,false);assert.equal(route.search.hideDropped,false,'reset exclusions must not survive a copied/reloaded search URL');
});
function renderSearchFragment(fragment,values={}){
 const jsx=(type,props)=>({type,props}),context={exports:{},...dependency('../lib/search-filters'),categories:dependency('../lib/catalog').categories,activeQuery:'',tag:'',category:'',catalogYear:'',advanced:{...dependency('../lib/search-filters').emptySearchFilters,weekdays:[]},sort:'popular',hideCompleted:false,hideDropped:false,resetFilters(){},require:name=>name==='react/jsx-runtime'?{jsx,jsxs:jsx}:undefined,...values};
 vm.createContext(context);vm.runInContext(ts.transpileModule('this.result=('+fragment+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);return context.result;
}
const fragmentText=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(fragmentText).join(''):'';
test('title search then completed exclusion can reset to an unfiltered share URL',()=>{
 const h=searchHarness();h.context.runSearch('芙莉莲');Object.assign(h.state,{hideCompleted:true,hideDropped:false,filteredCursors:[]});
 Object.assign(h.context,{category:h.state.category,setHideCompleted:value=>h.state.hideCompleted=value,setHideDropped:value=>h.state.hideDropped=value,setFilteredCursors:value=>h.state.filteredCursors=value});
 vm.runInContext(compile(clearSearch+'\n'+resetFilters),h.context);h.context.resetFilters();
 const links=dependency('../lib/share-links'),hash=links.searchHash({q:h.state.activeQuery,sort:h.state.sort,tag:h.state.tag,category:h.state.category,year:h.state.year,page:1,filters:h.state.advanced,hideCompleted:h.state.hideCompleted,hideDropped:h.state.hideDropped});
 assert.doesNotMatch(hash,/hideCompleted|hideDropped|q=/);assert.equal(renderSearchFragment(filterNotice,{...h.state,catalogYear:h.state.year}),false);
});
test('personal-only exclusions remain visible with a reset action',()=>{
 assert.equal(renderSearchFragment(filterNotice),false);
 for(const [key,label]of [['hideCompleted','排除已看完'],['hideDropped','排除已弃番']]){
  const shown=fragmentText(renderSearchFragment(filterNotice,{[key]:true}));assert.match(shown,new RegExp(label));assert.match(shown,/重置筛选/);
 }
});
test('tag search labels match sorting honestly as relevance',()=>{
 assert.match(fragmentText(renderSearchFragment(sortControls)),/播出日期/);
 const tagged=fragmentText(renderSearchFragment(sortControls,{tag:'奇幻',sort:'date'}));assert.match(tagged,/相关度/);assert.doesNotMatch(tagged,/播出日期/);
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
