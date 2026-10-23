const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,deps={},globals={}){
 const exports={};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{exports,URL,URLSearchParams,Request,Response,Headers,Error,SyntaxError,TextEncoder,TextDecoder,Uint8Array,AbortController,AbortSignal,DOMException,Date,crypto:webcrypto,setTimeout,clearTimeout,console,...globals,require:name=>{
  if(name in deps)return deps[name];if(name.startsWith('.')){const next=path.resolve(path.dirname(file),name);return load(next+'.ts',deps,globals);}throw Error('Unexpected import '+name);
 }},{filename:file});return exports;
}
function database(){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const part of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(part.trim())sql.exec(part);
 return {sql,prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);},execute(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
const plain=value=>JSON.parse(JSON.stringify(value)),tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
const text=node=>typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(text).join(''):'';
function nodes(tree,type){const found=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.type===type)found.push(node);[node.props?.children].flat(Infinity).forEach(walk);})(tree);return found;}
function discussionHarness(accountId){
 const slots=[],effects=[],reads=[],writes=[];let cursor=0,dirty=true,tree,props={subjectId:1,episodeNumber:1,accountId},serverOwner=accountId,refreshes=0;
 const react={useState(value){const i=cursor++;if(!(i in slots))slots[i]={value};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(value!==slots[i].value){slots[i].value=value;dirty=true;}}];},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value});},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props)=>({type,props});
 const component=load('components/Discussions.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/request-client':{requestJson(url,options={}){
  if(options.method!=='POST'){reads.push(url);return Promise.resolve({posts:[],total:0,authenticated:!!serverOwner,accountId:serverOwner||null});}
  return new Promise((resolve,reject)=>writes.push({body:JSON.parse(options.body),signal:options.signal,resolve,reject}));
 },anySignal:AbortSignal.any,timeoutSignal:()=>new AbortController().signal}},{localStorage:{getItem:()=>null,setItem(){}}}).default;
 props.onAccountChange=()=>refreshes++;
 const render=()=>{let turns=0;while(dirty){assert.ok(turns++<20,'discussion render loop');dirty=false;cursor=0;tree=component(props);effects.splice(0).forEach(fn=>fn());}return tree;};render();
 return {render,writes,reads,refreshes:()=>refreshes,update(next){props={...props,...next};serverOwner=props.accountId;dirty=true;render();},serverAccount(value){serverOwner=value;},stop(){slots.forEach(slot=>slot?.cleanup?.());}};
}
(async()=>{
 // Filter the same official titles shown on screen, while preserving source names and numeric matching.
 const playback=load('lib/playback-client.ts'),episodes=[{name:'第01集',url:'https://source.example/1'},{name:'第03集',url:'https://source.example/3'}],titles=new Map([[1,'冒险结束'],[3,'杀人魔法']]);
 assert.equal(playback.visibleEpisodes(episodes,'杀人魔法',false,titles)[0].number,3);
 assert.equal(playback.visibleEpisodes(episodes,'第03集',false,titles)[0].episode.url,episodes[1].url);
 assert.equal(playback.visibleEpisodes(episodes,'３',false,titles)[0].number,3);
 assert.deepEqual(plain(playback.visibleEpisodes(episodes,'',true,titles).map(e=>e.number)),[3,1]);
 const home=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let ready;
 (function find(node){if(ts.isJsxAttribute(node)&&node.name.text==='onReady'&&node.initializer?.expression)ready=node.initializer.expression.getText(home);ts.forEachChild(node,find);})(home);assert.ok(ready);
 let playError='Old failed line',sourceError='Old source timeout',confirmed=0;const current={sourceUrl:'https://source.example/1',url:'https://media.example/1.mp4'};
 const context={player:{...current,ruleName:'source',number:1},isCurrentPlayback:playback.isCurrentPlayback,activePlayerUrl:{current:current.sourceUrl},activeMediaUrl:{current:current.url},recovery:{current:{confirmed(){confirmed++;}}},setPlayError:value=>playError=value,setSourceError:value=>sourceError=value,playbackReport(){},writeStorage(){}};
 const onReady=vm.runInNewContext(compile('this.ready='+ready)+'\nthis.ready',context);onReady();assert.equal(playError,'');assert.equal(sourceError,'');assert.equal(confirmed,1);
 playError='New episode error';sourceError='New source error';context.activePlayerUrl.current='different';onReady();assert.equal(playError,'New episode error');assert.equal(sourceError,'New source error');assert.equal(confirmed,1,'old player callbacks cannot clear the new error');
 // Use real email sessions and the migrated database, never public production comments.
 const db=database(),env={DB:db,LINGQI_AUTH_SECRET:'test-only-review-auth-secret-123456789012345'},origin='https://site.example';
 const auth=load('lib/email-auth.ts',{'cloudflare:workers':{env},'../app/chatgpt-auth':{getChatGPTUser:async()=>null}});
 const register=async email=>{const response=await auth.emailAuthResponse(new Request(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'register',email,password:'test-only-review-password-12345'})}));assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0],user=await auth.getSiteUser(new Request(origin+'/api/library',{headers:{Cookie:cookie}}));return {cookie,id:user.userId};};
 const a=await register('review-a@example.test'),b=await register('review-b@example.test');let clock=Date.now();class Clock extends Date{static now(){return clock;}}
 const server=load('lib/discussion-server.ts',{'cloudflare:workers':{env},'./email-auth':auth},{Date:Clock}),endpoint=origin+'/api/discussions';
 const post=(body={},who=a)=>server.discussionResponse(new Request(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(who?{Cookie:who.cookie}:{})},body:JSON.stringify({subjectId:1,episode:1,body:'A review comment',alias:'Reviewer',mutationId:webcrypto.randomUUID(),accountId:who?.id,...body})}));
 const get=(query='subject=1&episode=1',who)=>server.discussionResponse(new Request(endpoint+'?'+query,{headers:who?{Cookie:who.cookie}:{}}));
 assert.equal((await post({},null)).status,401);assert.equal((await post({accountId:a.id},b)).status,409);assert.equal((await post({accountId:null})).status,409);assert.equal((await post({operation:'edit'})).status,400);
 const rootMutation=webcrypto.randomUUID();let result=await post({mutationId:rootMutation});assert.equal(result.status,201);const root=(await result.json()).id;
 assert.equal((await post({mutationId:rootMutation})).status,200);assert.equal((await post({mutationId:rootMutation,body:'Changed'})).status,409);assert.equal((await post({mutationId:rootMutation,episode:2})).status,409);assert.equal((await post({mutationId:rootMutation,alias:'Changed'})).status,409);
 let feed=await (await get()).json();assert.equal(feed.posts.length,1);assert.equal(feed.posts[0].own,false);assert.equal(feed.accountId,null);assert.doesNotMatch(JSON.stringify(feed),/email:|example\.test|user_id|mutation_id/);assert.equal((await (await get(undefined,a)).json()).accountId,a.id);
 clock+=11000;const retryId=webcrypto.randomUUID(),races=await Promise.all(Array.from({length:8},()=>post({mutationId:retryId})));assert.equal(races.filter(r=>r.status===201).length,1);assert.ok(races.every(r=>[200,201].includes(r.status)));const ids=await Promise.all(races.map(async r=>(await r.json()).id));assert.equal(new Set(ids).size,1);
 clock+=11000;const different=await Promise.all(Array.from({length:8},()=>post()));assert.equal(different.filter(r=>r.status===201).length,1);assert.equal(different.filter(r=>r.status===429).length,7);
 clock+=11000;const replyMutation=webcrypto.randomUUID();result=await post({parentId:root,mutationId:replyMutation});assert.equal(result.status,201);
 assert.equal((await post({operation:'delete',id:root},b)).status,403);assert.equal((await post({operation:'delete',id:root})).status,200);assert.equal((await post({operation:'delete',id:root})).status,200,'repeating a successful deletion stays successful');
 assert.equal((await post({mutationId:rootMutation})).status,409,'retry never resurrects deleted text');assert.equal((await post({parentId:root,mutationId:replyMutation})).status,200);assert.equal((await post({parentId:root})).status,409);
 clock+=11000;assert.equal((await post({episode:0})).status,201);feed=await (await get('subject=1&episode=0')).json();assert.equal(feed.posts.length,1,'episode zero has a separate usable discussion');
 for(const episode of [true,[],{},-1])assert.equal((await post({episode})).status,400);
 const legacy=load('lib/discussion-server.ts',{'cloudflare:workers':{env},'./email-auth':{getSiteUser:async()=>({userId:'legacy',provider:'chatgpt'})}});result=await legacy.discussionResponse(new Request(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({subjectId:1,body:'Legacy',mutationId:webcrypto.randomUUID(),accountId:'legacy'})}));assert.equal(result.status,401);
 // Real component handlers: a synchronous lock, retained retry token/draft, and account-change cancellation.
 const d=discussionHarness(a.id);nodes(d.render(),'details')[0].props.onToggle({currentTarget:{open:true}});d.render();await tick();d.render();
 const textarea=()=>nodes(d.render(),'textarea')[0],form=()=>nodes(d.render(),'form')[0];textarea().props.onChange({target:{value:'Keep my draft'}});d.render();
 const submit=form().props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(d.writes.length,1,'two clicks before React rerenders send one request');assert.equal(d.writes[0].body.accountId,a.id);assert.equal(textarea().props.disabled,true);
 d.writes[0].reject(Error('Network failed'));await tick();assert.equal(textarea().props.value,'Keep my draft');form().props.onSubmit({preventDefault(){}});assert.equal(d.writes.length,2);assert.equal(d.writes[0].body.mutationId,d.writes[1].body.mutationId);d.writes[1].resolve({saved:true,id:webcrypto.randomUUID()});await tick();d.render();await tick();d.render();assert.equal(textarea().props.value,'');
 textarea().props.onChange({target:{value:'Old account draft'}});d.render();form().props.onSubmit({preventDefault(){}});const old=d.writes.at(-1);d.update({accountId:b.id});await tick();d.render();assert.equal(old.signal.aborted,true);assert.equal(textarea().props.value,'');textarea().props.onChange({target:{value:'New account draft'}});d.render();form().props.onSubmit({preventDefault(){}});const latest=d.writes.at(-1);old.resolve({saved:true,id:webcrypto.randomUUID()});await tick();assert.equal(textarea().props.value,'New account draft');assert.equal(textarea().props.disabled,true,'old response cannot unlock the new account write');latest.resolve({saved:true,id:webcrypto.randomUUID()});await tick();d.render();await tick();d.render();assert.equal(textarea().props.value,'');d.stop();
 const stale=discussionHarness(a.id);stale.serverAccount(b.id);nodes(stale.render(),'details')[0].props.onToggle({currentTarget:{open:true}});stale.render();await tick();assert.equal(nodes(stale.render(),'form').length,0);assert.equal(stale.refreshes(),1);assert.match(text(stale.render()),/个人空间已切换/);stale.stop();
 console.log('PASS: official episode-title filtering, stale playback error isolation; real email-authenticated discussion ownership/account binding, atomic concurrent retries, deletion retries, episode zero and legacy rejection; component double-submit/draft/retry/account-switch races');
})().catch(error=>{console.error(error);process.exitCode=1;});
