const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const core=require('./check-feature-deps.cjs').dependency('../lib/playback-client');
const ast=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};
(function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)parts[node.name.text]=node.getText(ast);ts.forEachChild(node,visit);})(ast);
function harness({unknown=false,unnamed=false,subjectId=41,integrated=false}={}){
 let clock=1000;const recoveryModule={exports:{}};vm.runInNewContext(compile(fs.readFileSync('lib/playback-recovery.ts','utf8')),recoveryModule);
 const recovery=recoveryModule.exports.createPlaybackRecovery(()=>clock),subject={id:subjectId,name:'Test',eps:12},rule={name:'Source'};
 const episode={name:unknown||unnamed?'Opening':'第2集',url:'https://source.test/2',...(!unknown&&!unnamed?{number:2}:{})};
 const lines=unknown?[]:[{name:'Primary',episodes:unnamed?[{name:'Other',url:'https://source.test/1'},episode]:[episode]}];
 const controller=new AbortController(),calls=[],requests=[],reports=[],states={};
 const ctx={...core,Date:{now:()=>clock},AbortController,JSON,recovery:{current:recovery},roads:lines,roadsRef:{current:lines},playerProgress:{current:0},lastProgress:{current:0},playbackId:{current:1},beginPlayback:()=>({id:1,controller}),anySignal:s=>s[0],timeoutSignal:()=>controller.signal,availability:{checks:{},report:(...args)=>reports.push(args)},remember:(...args)=>calls.push(['remember',...args]),playEpisode:(...args)=>calls.push(['recover',...args]),api:async(url,options)=>{requests.push(JSON.parse(options.body));clock+=10000;throw Error('源站响应 403');}};
 for(const key of ['SourceError','PlayError','PlayMode','Player','ActiveRoad','ResolveStatus','RuleIdx','SourceResults','Roads','ChapterSource'])ctx['set'+key]=v=>states[key]=v;
 vm.createContext(ctx);vm.runInContext(compile(parts.resolveSource),ctx);
 if(integrated){
  const good={name:'Backup'},backup={name:'第2集',number:2,url:'https://backup.test/2'};
  Object.assign(ctx,{player:{subject,number:1,episode:'第1集'},selected:subject,episodes:[{sort:1},{sort:2}],rules:[rule,good],ruleIdx:0,subjectAliases:{},episodeResume:()=>0,saveProgress(){},stopSource(){},ruleCompatibility:()=>'',readStorage:()=>null,sourceCatalogueIssue:()=>'',searchNames:s=>[s.name],checkSource:async r=>({state:'found',checkedAt:clock,source:'https://catalog.test',results:[],roads:r.name==='Source'?lines:[{name:'Backup',episodes:[backup]}]})});
  ctx.api=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);clock+=10000;if(body.rule.name==='Source')throw Error('403');return {mode:'video',verified:true,url:'https://cdn.test/video.mp4'};};
  vm.runInContext(compile(parts.playEpisode),ctx);
 }
 return {ctx,subject,episode,rule,lines,controller,calls,requests,reports,states,recovery,advance:ms=>clock+=ms,run:()=>ctx.resolveSource(subject,episode,rule,47,lines)};
}
(async()=>{
 let h=harness();await h.run();assert.equal(h.calls[0][0],'recover');assert.deepEqual(h.calls[0].slice(2),[2,true,false,47]);assert.equal(h.recovery.remaining(),80000);assert.ok(h.recovery.failed('Source',h.episode.url));assert.equal(h.reports[0][1].episodeNumber,2);
 h=harness({unnamed:true});await h.run();assert.equal(h.calls[0][2],2);assert.equal(h.recovery.remaining(),80000,'index-derived identity must not reset the deadline');
 for(const options of [{unknown:true},{subjectId:0}]){h=harness(options);await h.run();assert.equal(h.calls.length,0);assert.equal(h.states.PlayMode,'unavailable');}
 for(const cancel of ['abort','stale']){h=harness();h.ctx.api=async()=>{if(cancel==='abort')h.controller.abort();else h.ctx.playbackId.current++;throw Error('cancelled');};await h.run();assert.equal(h.calls.length,0);assert.equal(h.reports.length,0);assert.ok(!h.recovery.failed('Source',h.episode.url));}
 h=harness();h.ctx.api=async()=>{h.advance(90000);throw Error('timeout');};await h.run();assert.equal(h.calls.length,0);assert.equal(h.states.PlayMode,'unavailable');
 h=harness();h.ctx.api=async()=>({mode:'unavailable',message:'No media'});await h.run();assert.ok(h.recovery.failed('Source',h.episode.url));assert.equal(h.calls[0][0],'recover');
 h=harness();h.ctx.api=async()=>({mode:'video',url:'https://cdn.test/video.mp4'});await h.run();assert.equal(h.states.PlayMode,'video');assert.equal(h.calls[0][0],'remember');assert.ok(!h.recovery.failed('Source',h.episode.url));
 h=harness({integrated:true});await h.run();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.states.PlayMode,'video');assert.equal(h.states.Player.number,2);assert.equal(h.states.Player.position,47,'fallback must preserve the requested episode position despite a stale previous-episode closure');assert.deepEqual(h.requests.map(x=>x.rule.name),['Source','Backup'],'automatic recovery must skip the already failed page');assert.equal(h.recovery.remaining(),70000);
 console.log('PASS: manual failure → same-episode cross-source recovery; preserved position/budget; failed-page skip; cancel/stale/unknown/deadline/success guards');
})().catch(error=>{console.error(error);process.exitCode=1;});
