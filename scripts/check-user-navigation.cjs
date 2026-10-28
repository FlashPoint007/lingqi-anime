const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const dependency=require('./check-feature-deps.cjs').dependency,source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};let route,initialize,catalogEffect;
(function visit(node){
 if(ts.isFunctionDeclaration(node)&&node.name)parts[node.name.text]=node.getText(source);
 if(ts.isBinaryExpression(node)&&node.left.getText(source)==='routeHandler.current')route=node.right.getText(source);
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('setRouteReady(true)'))initialize=node.arguments[0].getText(source);
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useLayoutEffect'&&node.arguments[0]?.getText(source).includes('readBrowseCache'))catalogEffect=node.arguments[0].getText(source);
 ts.forEachChild(node,visit);
})(source);
function execute(code,globals){const context={URL,URLSearchParams,Date,Intl,AbortController,AbortSignal,console,...globals};vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context;}
function harness(hash='#search?sort=popular&page=1',personalReady=true){
 const entries=[{hash,state:null}],location={hash,origin:'https://site.example'},starts=[],toasts=[];let cursor=0,context;
 const history={get state(){return entries[cursor].state;},pushState(state,unused,next){entries.splice(cursor+1);entries.push({hash:next,state});cursor++;location.hash=next;},replaceState(state,unused,next){entries[cursor]={hash:next,state};location.hash=next;}};
 const values={...dependency('../lib/catalog'),...dependency('../lib/share-links'),...dependency('../lib/search-query'),...dependency('../lib/search-filters'),title:s=>s.name_cn||s.name,ready:true,personal:{ready:personalReady},location,window:{history},view:'discover',selected:null,player:null,playResume:true,historyRef:{current:[]},collection:[],menus:[{id:'discover'},{id:'calendar'},{id:'history'}],navigationHash:{current:hash},navigationEpoch:{current:0},routeApplying:{current:false},routeHandler:{current:null},flushProgress:{current(){}},privatePlaybackRef:{current:false},recentSearches:[],searchHistoryKey:'test-searches',hideCompleted:false,hideDropped:false,persist(){},stopPlayback(){},stopSource(){},start:(...args)=>starts.push(args),setToast:value=>toasts.push(value),openSubject(){},setReload(){},setRouteReady:value=>context.routeReady=value};
 for(const key of ['Query','ActiveQuery','Sort','Tag','Category','CatalogYear','Offset','Advanced','View','Error','RecentSearches','HideCompleted','HideDropped','FilteredCursors','Player','Roads','SourceResults','ChapterSource','SourceError','Episodes','Selected','SeasonYear','SeasonQuarter','Day','SourceTerm'])values['set'+key]=value=>context[key[0].toLowerCase()+key.slice(1)]=value;
 context=execute(parts.markNavigation+'\n'+parts.runSearch+'\n'+parts.navigate+'\nthis.route='+route+';this.initialize='+initialize,values);context.routeHandler.current=context.route;
 return {context,entries,location,starts,toasts,back(){assert.ok(cursor>0,'an earlier search must remain in browser history');cursor--;location.hash=entries[cursor].hash;context.route();},forward(){assert.ok(cursor<entries.length-1);cursor++;location.hash=entries[cursor].hash;context.route();}};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('submitting distinct searches preserves Back/Forward results and avoids duplicate entries',()=>{
 const app=harness(),c=app.context;c.runSearch('高达');c.runSearch('咒术回战');assert.equal(app.entries.length,3,'search submission must push a new route, rather than replace the preceding result');assert.equal(new URLSearchParams(app.location.hash.split('?')[1]).get('q'),'咒术回战');
 app.back();assert.equal(c.activeQuery,'高达');assert.equal(c.query,'高达');assert.equal(c.offset,0);app.forward();assert.equal(c.activeQuery,'咒术回战');c.runSearch('咒术回战');assert.equal(app.entries.length,3,'reloading the same search must not create another Back step');
 const before=app.location.hash;c.runSearch('tag:"unterminated');assert.equal(app.location.hash,before);assert.equal(app.entries.length,3);assert.ok(app.toasts.length,'invalid shortcut input remains visible without changing routes');
});
test('search deep links and public navigation do not wait for a personal-data request',()=>{
 const app=harness('#search?q=%E9%AB%98%E8%BE%BE&sort=popular&page=2',false),c=app.context;c.navigationHash.current=undefined;c.initialize();assert.equal(c.routeReady,true,'public controls must become ready independently of library synchronization');assert.equal(c.activeQuery,'高达');assert.equal(c.offset,20);assert.equal(c.sort,'popular');c.navigate('calendar');assert.equal(c.view,'calendar');
});
test('watch deep links wait for account scope, and public navigation cancels a pending resume',()=>{
 const app=harness('#watch/41',false),c=app.context;c.navigationHash.current=undefined;c.historyRef.current=[{subject:{id:41,name:'Known title'},episode:'EP2',number:2,url:'https://source.example/2',position:87,ruleName:'Source'}];c.initialize();assert.equal(app.starts.length,0);assert.equal(c.navigationHash.current,undefined,'a deferred private route must not be marked as applied');c.personal.ready=true;c.initialize();assert.equal(app.starts.length,1);assert.equal(app.starts[0][2],87);c.initialize();assert.equal(app.starts.length,1,'resolved history starts only once');
 const leave=harness('#watch/41',false);leave.context.navigationHash.current=undefined;leave.context.initialize();assert.equal(leave.context.routeReady,true);leave.context.navigate('calendar');leave.context.personal.ready=true;leave.context.initialize();assert.equal(leave.starts.length,0);assert.equal(leave.context.view,'calendar','late account readiness cannot undo an explicit navigation');
});
test('personal exclusion filters wait safely while the public catalogue remains independent',()=>{
 let network=0;const states={};const context=execute('this.effect='+catalogEffect,{view:'discover',personalFilterPending:true,setLoading:v=>states.loading=v,setCatalogUpdating:v=>states.updating=v,setItems:v=>states.items=v,setTotal:v=>states.total=v,setFilteredNext:v=>states.next=v,setError(){},api(){network++;throw Error('personal filters must wait');}});
 context.effect();assert.equal(network,0);assert.equal(states.loading,true);assert.equal(states.items.length,0,'unfiltered cached cards must not be presented as personal-filtered results');
});
let failed=0;for(const [name,fn]of tests)try{fn();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}process.exitCode=failed?1:0;
