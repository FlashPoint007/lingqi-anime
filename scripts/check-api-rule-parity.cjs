const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(file,deps={}){const context={exports:{},URL,URLSearchParams,Request,Response,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,console,require:name=>{assert.ok(name in deps,'Unexpected dependency '+name);return deps[name];}};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),context);return context.exports;}
const core=load('lib/web-core.ts'),api=load('lib/rule-api.ts',{'./web-core':core}),plain=value=>JSON.parse(JSON.stringify(value));
const rule={name:'API test',baseURL:'https://source.test/',searchMode:'api',chapterMode:'api',searchApiConfig:{request:{url:'https://api.source.test/search'},listPath:'$.list[*]',namePath:'$.name',sourcePath:'$.id'},chapterApiConfig:{request:{url:'https://api.source.test/detail',query:{id:'@source'}},format:'delimited',roadNamesPath:'$.info.vod_play_from',roadEpisodesPath:'$.info.vod_play_url',roadSeparator:'$$$',episodeSeparator:'#',fieldSeparator:'$'}};
const response={info:{vod_play_from:'Main$$$Mirror',vod_play_url:'第01集$https://cdn.test/1.m3u8?token=a$b#invalid#第02集$https://cdn.test/2.mp4$$$第01集$https://backup.test/1.m3u8'}};
const tests=[];const test=(name,run)=>tests.push([name,run]);
test('current upstream delimited chapters retain road names, episodes and signed media URLs',()=>{
 const roads=api.apiChapters(response,rule.chapterApiConfig,'321',rule.baseURL);assert.equal(roads.length,2);assert.equal(roads[0].name,'Main');assert.equal(roads[0].episodes.length,2);assert.equal(roads[0].episodes[0].url,'https://cdn.test/1.m3u8?token=a$b');assert.equal(roads[0].episodes[0].mediaUrl,roads[0].episodes[0].url);assert.equal(roads[1].name,'Mirror');
 const snapshot=JSON.parse(fs.readFileSync('lib/rules-snapshot.json','utf8'));assert.equal(snapshot.entries.length,17);for(const entry of snapshot.entries)assert.doesNotThrow(()=>core.validateRule(entry.rule));const current=snapshot.entries.find(entry=>entry.rule.name==='giriGiriLove').rule;assert.equal(current.version,'2.6');assert.equal(api.apiChapters(response,current.chapterApiConfig,'321',current.baseURL).length,2,'exercise the actual currently subscribed rule, not only a generic configuration');
 const hostile={info:{vod_play_from:'Main',vod_play_url:'bad$https://127.0.0.1/x.mp4#bad$javascript:alert(1)#good$https://cdn.test/ok.mp4'}};assert.equal(api.apiChapters(hostile,rule.chapterApiConfig,'321',rule.baseURL)[0].episodes.length,1);
 assert.throws(()=>api.apiChapters(response,{...rule.chapterApiConfig,fieldSeparator:''},'321',rule.baseURL),/分隔符/);
});
test('nested entries without templates and one-based template variables follow upstream rules',()=>{
 const data={data:{roads:[{name:'Test',episodes:[{name:'First',url:'/play/1'},{name:'Second',url:'https://cdn.test/2.mp4'},{name:'Missing'}]}]}};
 const config={roadsPath:'$.data.roads[*]',roadNamePath:'$.name',episodesPath:'$.episodes[*]',episodeNamePath:'$.name',episodeUrlPath:'$.url'};
 const roads=api.apiChapters(data,config,'4',rule.baseURL);assert.deepEqual(plain(roads[0].episodes.map(ep=>ep.url)),['https://source.test/play/1','https://cdn.test/2.mp4']);
 assert.equal(api.apiChapters(data.data.roads[0],{...config,roadsPath:''},'4',rule.baseURL)[0].episodes.length,2,'empty roadsPath treats the response as one road');
 const page={url:'https://source.test/play/@source/@roadNumber/@episodeNumber',query:{index:'@episodeIndex',raw:'@episodeUrl'}};
 const numbered=api.apiChapters(data,{...config,episodePage:page},'4',rule.baseURL);assert.equal(numbered[0].episodes[1].url,'https://source.test/play/4/1/2?index=1&raw=https%3A%2F%2Fcdn.test%2F2.mp4');
});
test('quoted JSONPath keys and form requests remain restricted and encode variables once',()=>{
 assert.deepEqual(plain(api.selectJson({'data.rows':[{'play-url':'https://cdn.test/x.mp4'}]},'$["data.rows"][*][\'play-url\']')),['https://cdn.test/x.mp4']);
 for(const path of ['$..secret','$[?(@.id)]','$[0:3]','$[evil()]'])assert.throws(()=>api.selectJson({},path),/JSONPath/);
 const prepared=api.apiRequest({...rule,searchApiConfig:{request:{method:'POST',url:'https://api.source.test/search',bodyType:'form',body:{wd:'@keyword',id:'@source'}}}},'search',{keyword:'命运 & Zero',source:'7'});assert.match(prepared.init.headers['Content-Type'],/^application\/x-www-form-urlencoded/);assert.equal(new URLSearchParams(prepared.init.body).get('wd'),'命运 & Zero');
 const none=api.apiRequest({...rule,searchApiConfig:{request:{method:'POST',url:'https://api.source.test/search',bodyType:'none',body:{wd:'ignored'}}}},'search',{});assert.equal(none.init.body,undefined);
});
test('history resumes catalogue-backed media through its saved rule and server verification',()=>{
 const source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let start;
 (function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='start')start=node.getText(source);ts.forEachChild(node,visit);})(source);
 const calls=[],subject={id:41,name:'Test',eps:12},episode={name:'第2集',number:2,url:'https://cdn.test/2.mp4',source:'321'};
 const playback=require('./check-feature-deps.cjs').dependency('../lib/playback-client');
 const context={...playback,URL,rules:[rule],ruleIdx:0,roads:[],player:null,selected:subject,title:s=>s.name,stopSource(){},stopPlayback(){},setPlayError:message=>calls.push(['error',message]),setSourceTerm(){},setEpisodes(){},setSelected(){},setRoads(){},setSourceResults(){},setChapterSource(){},setRuleIdx(){},sourceCatalogueIssue:()=>'',sourceChapters(){},resolveSource:(...args)=>calls.push(['resolve',...args]),playEpisode:(...args)=>calls.push(['auto',...args]),setPlayMode(){},setPlayer:()=>calls.push(['direct']),setDirect(){},remember(){},playerProgress:{current:0},lastProgress:{current:0}};
 vm.createContext(context);vm.runInContext(compile(start),context);context.start(subject,episode,47,rule.name);assert.equal(calls[0][0],'resolve');assert.equal(calls[0][3].name,rule.name);assert.equal(calls[0][4],47);
 context.rules=[];calls.length=0;context.start(subject,episode,47,rule.name);assert.equal(calls[0][0],'auto','a removed catalogue rule must recover the episode instead of treating the old CDN URL as a custom direct link');
});
test('production source endpoint authorizes CDN media through the selected upstream catalogue only',async()=>{
 const source=ts.createSourceFile('route.ts',fs.readFileSync('app/api/[...path]/route.ts','utf8'),ts.ScriptTarget.Latest,true),parts={};
 for(const node of source.statements)if(ts.isFunctionDeclaration(node)&&node.name)parts[node.name.text]=node.getText(source);
 const fetches=[],resolved=[];const context={exports:{},...api,...core,URL,URLSearchParams,Request,Response,Headers,AbortSignal,console,json:(data,status=200)=>Response.json(data,{status}),readRequestText:req=>req.text(),RequestLimitError:class extends Error{},boundedText:r=>r.text(),discard(){},cachedJson:async(_kind,_identity,loader)=>Response.json(await loader()),fetch:async url=>{fetches.push(url);return Response.json(response);},resolvePlayback:async(_rule,page,declared)=>{resolved.push({page,declared});return {media:declared||page,referer:page,verified:true,mediaType:'hls'};},signedMediaUrl:async()=>'/api/media?ticket=checked'};
 vm.createContext(context);vm.runInContext(compile(parts.POST+'\n'+parts.loadSourceData),context);
 const post=body=>context.POST(new Request('https://site.test/api/source',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({rule,...body})}));
 const catalogue=await (await post({operation:'chapters',url:'321',source:'321'})).json();assert.equal(catalogue.roads.length,2);
 let result=await post({operation:'resolve',url:'https://cdn.test/1.m3u8?token=a$b',source:'321'});assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).mode,'video');assert.equal(resolved.at(-1).declared,'https://cdn.test/1.m3u8?token=a$b');assert.equal(new URL(resolved.at(-1).page).origin,'https://source.test');
 const count=resolved.length;for(const body of [{url:'https://cdn.test/not-in-catalogue.mp4',source:'321'},{url:'https://cdn.test/1.m3u8?token=a$b'},{url:'https://evil.test/page',source:'321'},{url:'https://127.0.0.1/internal.mp4',source:'321'}]){result=await post({operation:'resolve',...body});assert.equal(result.status,400);}
 assert.equal(resolved.length,count,'unlisted media must never reach the resolver or signer');assert.ok(fetches.every(url=>url.startsWith('https://api.source.test/detail')),'no client-supplied media or HTML URL is fetched before catalogue validation');
});
(async()=>{let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
