const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
function load(file,deps={},globals={},modules=new Map()){
 file=path.resolve(file);if(modules.has(file))return modules.get(file);
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 const exports={};modules.set(file,exports);
 const requireFile=name=>name in deps?deps[name]:load(path.resolve(path.dirname(file),name)+(path.extname(name)?'':'.ts'),deps,globals,modules);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:requireFile,URL,URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,DOMException,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,console,...globals},{filename:file});return exports;
}
const core=load('lib/rule-repository.ts'),official=core.OFFICIAL_RULE_ROOT;
const root=name=>'https://raw.githubusercontent.com/tester/rules/main/'+name+'/';
const snapshot=JSON.parse(fs.readFileSync('lib/rules-snapshot.json','utf8'));
const demo=(name='Demo')=>({...snapshot.entries[0].rule,name});
const testCases=[],test=(name,run)=>testCases.push([name,run]);
test('repository normalization accepts canonical directories and index variants',()=>{
 for(const value of ['',official,official+'index.json',official+'INDEX.JSON/',official+'%69ndex.json'])assert.equal(core.normalizeRuleRepository(value),official);
 assert.equal(core.normalizeRuleRepository(root('custom').slice(0,-1)),root('custom'));
 assert.equal(core.normalizeRuleRepository(root('v1.2')),root('v1.2'));
});
test('repository reader rejects credentials, local/proxy hosts, malformed paths and file URLs',()=>{
 for(const value of ['http://raw.githubusercontent.com/a/b/main/','https://user:pass@raw.githubusercontent.com/a/b/main/','https://127.0.0.1/','https://raw.githubusercontent.com.evil.example/a/b/main/','https://ghfast.top/https://raw.githubusercontent.com/a/b/main/','https://github.com/a/b','https://raw.githubusercontent.com/a/b/','https://raw.githubusercontent.com/a/b/main/file.json','https://raw.githubusercontent.com/a/b/main/?token=secret','https://raw.githubusercontent.com/a/b/main/#x','https://raw.githubusercontent.com/a/b/main/%2fetc/','https://raw.githubusercontent.com/a/b/main\\other/','file:///tmp/index.json'])assert.throws(()=>core.normalizeRuleRepository(value),undefined,value);
 for(const value of [[],[{name:'A'},{name:'A'}],[{name:'../secret'}],[{name:'index'}],Array.from({length:501},(_,i)=>({name:String(i)}))])assert.throws(()=>core.repositoryCatalog(value));
 assert.equal(core.repositoryCatalog([{name:'中文源',version:2}])[0].file,'中文源.json');
});
test('local installs cannot overwrite another rule or forge the global subscription',()=>{
 const repository=root('install'),rule={...demo(),subscription:'forged',subscriptionFile:'forged.json',repositorySource:root('evil'),enabled:false,userDisabled:true};
 let rules=core.installRepositoryRule([],repository,'Demo.json',rule);assert.equal(rules.length,1);assert.equal(rules[0].subscription,undefined);assert.equal(rules[0].repositorySource,repository);assert.equal(rules[0].enabled,true);
 rules[0]={...rules[0],enabled:false,userDisabled:true};rules=core.installRepositoryRule(rules,repository,'Demo.json',{...rule,version:'2'});assert.equal(rules[0].enabled,false);assert.equal(rules[0].userDisabled,true);assert.equal(rules[0].version,'2');
 assert.equal(core.installRepositoryRule(rules,root('another'),'Demo.json',rule),rules);
 assert.equal(core.installRepositoryRule(rules,repository,'Other.json',rule),rules);
 assert.equal(core.installRepositoryRule(rules,repository,'Demo.json',{...rule,deprecated:true}),rules);
 const global=[{...demo(),subscription:'Predidit/KazumiRules',subscriptionFile:'Demo.json'}];assert.equal(core.installRepositoryRule(global,repository,'Demo.json',rule),global);
 const subs=load('lib/subscriptions.ts');assert.ok(subs.mergeSubscribed(rules,snapshot.entries,snapshot.entries.map(e=>e.file)).some(r=>r.repositorySource===repository),'official sync preserves local repository installs');
});
test('server enforces the current index, name matching, bounded reads and no redirects',async()=>{
 let calls=[],payloads=new Map();const server=load('lib/rule-repository-server.ts',{}, {fetch:async(url,init)=>{calls.push({url,init});assert.equal(init.redirect,'error');const value=payloads.get(url);if(value instanceof Response)return value;return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});}});
 const response=(repository,file)=>server.repositoryResponse(new URLSearchParams({repository,...(file?{name:file}:{})}),new AbortController().signal);
 const repository=root('server');payloads.set(repository+'index.json',[{name:'Demo',version:'1'}]);payloads.set(repository+'Demo.json',demo());
 let r=await response(repository);assert.equal(r.status,200);assert.equal((await r.json()).items[0].file,'Demo.json');assert.equal(calls.length,1);
 r=await response(repository,'../secret.json');assert.equal(r.status,404);assert.equal(calls.length,1,'non-indexed paths are never fetched');
 r=await response(repository,'Demo.json');assert.equal(r.status,200);assert.equal((await r.json()).rule.name,'Demo');assert.equal(calls.length,2);await response(repository,'Demo.json');assert.equal(calls.length,2,'validated results use a bounded cache');
 r=await response('https://internal.example/');assert.equal(r.status,400);assert.equal(calls.length,2,'invalid hosts never reach fetch');
 payloads.set(root('redirect')+'index.json',new Response('redirect',{status:302,headers:{Location:'https://internal.example/'}}));r=await response(root('redirect'));assert.equal(r.status,502);
 payloads.set(root('large')+'index.json',new Response('x'.repeat(1048577)));r=await response(root('large'));assert.equal(r.status,502);assert.match((await r.json()).error,/1 MB/);
 payloads.set(root('mismatch')+'index.json',[{name:'Demo'}]);payloads.set(root('mismatch')+'Demo.json',demo('Wrong'));r=await response(root('mismatch'),'Demo.json');assert.equal(r.status,502);assert.match((await r.json()).error,/不一致/);
 payloads.set(root('broken')+'index.json',[{name:'Demo'}]);payloads.set(root('broken')+'Demo.json',{...demo(),deprecated:true});assert.equal((await response(root('broken'),'Demo.json')).status,502);
});
test('custom repository API never invokes or replaces the shared site-rule sync',async()=>{
 const file='app/api/[...path]/route.ts',source=fs.readFileSync(file,'utf8'),deps={};for(const match of source.matchAll(/from ['"]([^'"]+)['"]/g))deps[match[1]]={};
 let custom=0,global=0;deps['../../../lib/rule-repository-server']={repositoryResponse:async()=>{custom++;return Response.json({items:[]});}};deps['../../../lib/site-rules']={siteRules:async()=>{global++;return {entries:[],files:[]};}};
 const route=load(file,deps);assert.equal((await route.GET(new Request('https://site.example/api/rules?repository='+encodeURIComponent(root('route'))))).status,200);assert.equal(custom,1);assert.equal(global,0);
 await route.GET(new Request('https://site.example/api/rules'));assert.equal(global,1);
});
const jsx=(type,props,key)=>({type,props,key});
function nodes(root,type){const out=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(n.type===type)out.push(n);walk(n.props?.children);}walk(root);return out;}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};},flush=()=>new Promise(r=>setImmediate(r));
test('switching repositories detaches both old catalogs and pending installations',async()=>{
 let cursor=0,tree,rules=[],installs=0;const slots=[],effects=[],pending=[],store=new Map();
 const react={useState(value){const i=cursor++;if(!slots[i])slots[i]={value};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i];},useEffect(fn){const i=cursor++;if(!slots[i]){slots[i]={};effects.push(fn);}}};
 const client=load('lib/request-client.ts');
 const component=load('components/RuleRepository.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'../lib/request-client':{...client,timeoutSignal:()=>new AbortController().signal,requestJson:(url,init)=>{const task=deferred();pending.push({...task,url,signal:init.signal});return task.promise;}}},{localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}}).default;
 const props=()=>({rules,onInstall:(root,file,rule)=>{installs++;rules=core.installRepositoryRule(rules,root,file,rule);}}),render=()=>{cursor=0;tree=component(props());effects.splice(0).forEach(fn=>fn());};
 const change=value=>{nodes(tree,'input').find(n=>n.props['aria-label']==='规则仓库地址').props.onChange({target:{value}});render();},submit=()=>{nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});render();};
 const a=root('clientA'),b=root('clientB');render();change(a);submit();assert.equal(pending.length,1);change(b);assert.equal(pending[0].signal.aborted,true);submit();assert.equal(pending.length,2);
 pending[1].resolve({repository:b,items:[{name:'Demo',file:'Demo.json',version:'1'}]});await flush();render();pending[0].resolve({repository:a,items:[{name:'Stale',file:'Stale.json'}]});await flush();render();assert.equal(nodes(tree,'button').filter(n=>n.props['aria-label']==='安装规则 Demo').length,1);assert.equal(nodes(tree,'button').filter(n=>n.props['aria-label']==='安装规则 Stale').length,0);assert.equal(store.get(core.REPOSITORY_STORAGE_KEY),b);
 nodes(tree,'button').find(n=>n.props['aria-label']==='安装规则 Demo').props.onClick();render();assert.equal(pending.length,3);change(a);pending[2].resolve({repository:b,file:'Demo.json',rule:demo()});await flush();render();assert.equal(installs,0,'late rule files cannot install after switching');
 change(b);submit();pending[3].resolve({repository:b,items:[{name:'Demo',file:'Demo.json',version:'1'}]});await flush();render();nodes(tree,'button').find(n=>n.props['aria-label']==='安装规则 Demo').props.onClick();render();pending[4].resolve({repository:b,file:'Demo.json',rule:demo()});await flush();render();assert.equal(installs,1);assert.equal(rules[0].repositorySource,b);assert.equal(nodes(tree,'button').filter(n=>n.props['aria-label']==='更新规则 Demo').length,1);
});
(async()=>{let failed=0;for(const [name,run]of testCases){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})();
