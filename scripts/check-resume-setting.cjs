const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ast=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={},attrs={};let route,initialize,receive,backup;
(function visit(node){
 if(ts.isFunctionDeclaration(node)&&node.name)parts[node.name.text]=node.getText(ast);
 if(ts.isBinaryExpression(node)&&node.left.getText(ast)==='routeHandler.current')route=node.right.getText(ast);
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('lingqiHydrated'))initialize=node.arguments[0].getText(ast);
 if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='receive')receive=node.initializer.getText(ast);
 if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer)){
  const expression=node.initializer.expression?.getText(ast)||'';
  if(node.name.getText(ast)==='onResume')attrs.history=expression;
  if(node.name.getText(ast)==='onClick'&&expression.includes('start(resumeRecord.subject'))attrs.detail=expression;
  if(node.name.getText(ast)==='onClick'&&expression.includes("'kazumi-backup.json'"))backup=expression;
 }
 ts.forEachChild(node,visit);
})(ast);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function execute(source,values={}){const context={Date,URL,JSON,console,...values};vm.createContext(context);vm.runInContext(compile(source),context);return context;}
const subject={id:41,name:'Sample'},record={subject,episode:'第1集',number:1,url:'https://source.test/1',position:80,ruleName:'Source',progresses:{'0':{position:12,completed:false},'1':{position:80,completed:false},'2':{position:120,completed:true}}};
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('disabling automatic resume ignores saved progress but keeps an active episode when changing sources',()=>{
 const h=execute(parts.episodeResume,{playResume:false,player:null,historyRef:{current:[record]}});
 assert.equal(h.episodeResume(subject,1,0),0,'opening a previously watched episode must honor the Off setting');
 h.player={subject,number:1};assert.equal(h.episodeResume(subject,1,33),33,'changing the current episode source must preserve the in-memory position');
 h.player=null;h.playResume=true;assert.equal(h.episodeResume(subject,1,0),80);assert.equal(h.episodeResume(subject,0,0),12);assert.equal(h.episodeResume(subject,2,0),0,'completed episodes start again');
});
test('history and detail buttons honor the resume switch',()=>{
 const starts=[],h=execute('this.history='+attrs.history+';this.detail='+attrs.detail,{playResume:false,resumeRecord:record,start:(...args)=>starts.push(args)});
 h.history(record);h.detail();assert.deepEqual(starts.map(args=>args[2]),[0,0]);h.playResume=true;h.history(record);h.detail();assert.deepEqual(starts.slice(2).map(args=>args[2]),[80,80]);
});
test('direct watch links honor the same setting',()=>{
 const starts=[],h=execute('this.route='+route,{playResume:false,ready:true,personal:{ready:true},navigationHash:{current:undefined},navigationEpoch:{current:0},routeApplying:{current:false},location:{hash:'#watch/41'},selected:null,player:null,parseShareRoute:()=>({view:'watch',id:41}),historyRef:{current:[record]},flushProgress:{current(){}},stopPlayback(){},stopSource(){},setPlayer(){},setRoads(){},setSourceResults(){},setChapterSource(){},setSourceError(){},setEpisodes(){},setSelected(){},setSourceTerm(){},title:s=>s.name,start:(...args)=>starts.push(args)});
 h.route();assert.equal(starts[0][2],0);h.playResume=true;h.navigationHash.current=undefined;h.route();assert.equal(starts[1][2],80);
});
test('the local setting survives startup, storage events and backup round trips',async()=>{
 const writes=[],values=[],h=execute((parts.changePlayResume||'')+'\nthis.initialize='+initialize+';this.receive='+receive,{setPlayResume:value=>values.push(value),persist:(...args)=>writes.push(args),setRules(){},mergeSubscribed:()=>[],cleanRules:()=>[],stored:(key,fallback)=>key==='kw-play-resume'?false:fallback,initialRules:[],setDark(){},privatePlaybackRef:{current:false},setPrivatePlayback(){},setDay(){},currentWeekday:()=>0,setReady(){},document:{documentElement:{dataset:{}}},window:{dispatchEvent(){}},Event:class{},personal:{},searchHistoryKey:'unused'});
 assert.equal(typeof h.changePlayResume,'function');h.changePlayResume(false);assert.deepEqual(writes.at(-1),['kw-play-resume',false]);h.initialize();assert.equal(values.at(-1),false);h.receive({key:'kw-play-resume',newValue:'true'});assert.equal(values.at(-1),true);assert.equal(writes.length,1,'a cross-tab update must not broadcast another write');
 let exported;const backupData={version:1,collection:[],history:[],aliases:{},danmakuPreferences:{},rules:[],dark:false,searches:[],playerPreferences:{},playResume:false};
 const exportContext=execute('this.backup='+backup,{...backupData,recentSearches:[],subjectAliases:{},saveFile:value=>exported=value,readPlayerPreferences:()=>({}),readStorage:()=>null});exportContext.backup();assert.equal(exported.playResume,false,'exports retain the playback behavior');
 const context={scope:'ready:anonymous',request:0},restored=[],input={value:'backup.json',files:[{size:100,text:async()=>JSON.stringify(backupData)}]};
 const importing=execute(parts.importBackup,{personal:{ready:true},backupImport:{current:context},cleanRules:()=>[],cleanCollection:()=>[],setCollection(){},setRules(){},setHistory(){},mergeHistory:()=>[],setDark(){},setDanmakuPreferences(){},danmakuSettings:value=>value,setSubjectAliases(){},cleanSubjectAliases:value=>value,playerPreferences:value=>value,persist(){},changePlayResume:value=>restored.push(value),setRecentSearches(){},searchHistory:()=>[],searchHistoryKey:'unused',setToast(){}});
 await importing.importBackup({currentTarget:input});assert.deepEqual(restored,[false]);assert.equal(input.value,'');
});
(async()=>{let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
