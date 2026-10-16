const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
(async()=>{
 // Exercise browsers without the newer static AbortSignal methods.
 const timers=new Map();let nextTimer=0;
 const context={exports:{},AbortSignal:class {},AbortController,DOMException,setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},fetch:async()=>Response.json({ok:true})};
 vm.createContext(context);vm.runInContext(compile(fs.readFileSync('lib/request-client.ts','utf8')),context);const api=context.exports;
 const a=new AbortController(),b=new AbortController(),combined=api.anySignal([a.signal,b.signal]);b.abort(new Error('cancelled'));assert.equal(combined.aborted,true);assert.equal(combined.reason.message,'cancelled');assert.equal(api.anySignal([b.signal]).aborted,true);
 const timeout=api.timeoutSignal(25);[...timers.values()].find(timer=>timer.delay===25).fn();assert.equal(timeout.aborted,true);assert.equal(timeout.reason.name,'TimeoutError');
 assert.equal((await api.requestJson('/api/test')).ok,true);
 context.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(api.requestJson('/api/test'),/网络连接失败/);
 context.fetch=async()=>new Response('<html>Bad gateway</html>',{status:502});await assert.rejects(api.requestJson('/api/test'),/有效数据（502）/);
 context.fetch=async()=>Response.json(null);await assert.rejects(api.requestJson('/api/test'),/格式不正确/);
 context.fetch=async()=>Response.json({error:'请缩小搜索范围'},{status:400});await assert.rejects(api.requestJson('/api/test'),/缩小搜索/);
 context.fetch=async()=>({ok:true,status:200,json:async()=>{throw new DOMException('timeout','TimeoutError');}});await assert.rejects(api.requestJson('/api/test'),/请求超时/);
 // Exercise the real backup/file handlers, including repeated and failed reads.
 const source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const handler=name=>{let code;const walk=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)code=node.getText(source);ts.forEachChild(node,walk);};walk(source);assert.ok(code,name);return compile(code);};
 const state={collection:[],rules:[],history:[],dark:false,toast:'',ruleError:''};const fileContext={JSON,Map,Error,cleanRules:value=>value,cleanCollection:value=>value,mergeHistory:(old,value)=>[...old,...value],importRule:()=>{}};
 for(const name of Object.keys(state))fileContext['set'+name[0].toUpperCase()+name.slice(1)]=value=>state[name]=typeof value==='function'?value(state[name]):value;
 vm.createContext(fileContext);vm.runInContext(handler('importBackup')+handler('importRuleFile'),fileContext);
 const input={value:'backup.json',files:[{size:100,text:async()=>JSON.stringify({version:1,collection:[{id:1,name:'Safe'}],rules:[],history:[],dark:true})}]};
 await fileContext.importBackup({currentTarget:input});assert.equal(state.dark,true);assert.equal(state.collection.length,1);assert.equal(input.value,'');assert.equal(state.toast,'备份已恢复');
 input.value='backup.json';input.files=[{size:4,text:async()=>'null'}];await fileContext.importBackup({currentTarget:input});assert.equal(state.toast,'备份格式不正确');assert.equal(input.value,'');assert.equal(state.collection.length,1);
 input.value='rules.json';input.files=[{size:100,text:async()=>{throw Error('文件读取失败');}}];await fileContext.importRuleFile({currentTarget:input});assert.equal(state.ruleError,'文件读取失败');assert.equal(input.value,'');
 // Verify a failed new search cannot leave pagination from a previous result.
 let catalogueEffect;const walkEffects=node=>{if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes("setItems([])"))catalogueEffect=node.arguments[0].getText(source);ts.forEachChild(node,walkEffects);};walkEffects(source);assert.ok(catalogueEffect);
 const catalogueState={total:2000,cached:true,searchLimited:true,items:[{id:1}],loading:false,error:''};let rejectSearch;
 const catalogueContext={AbortController,URLSearchParams,anySignal:signals=>AbortSignal.any(signals),timeoutSignal:ms=>AbortSignal.timeout(ms),view:'discover',sort:'date',activeQuery:'Missing',tag:'',category:'',catalogYear:'',offset:0,PAGE_SIZE:24,api:()=>new Promise((_,reject)=>rejectSearch=reject)};
 for(const name of Object.keys(catalogueState))catalogueContext['set'+name[0].toUpperCase()+name.slice(1)]=value=>catalogueState[name]=value;
 vm.createContext(catalogueContext);vm.runInContext(compile('this.load='+catalogueEffect),catalogueContext);catalogueContext.load();assert.equal(catalogueState.total,0);assert.equal(catalogueState.cached,false);assert.equal(catalogueState.searchLimited,false);rejectSearch(Error('network failed'));await new Promise(resolve=>setImmediate(resolve));assert.equal(catalogueState.total,0);assert.equal(catalogueState.loading,false);assert.equal(catalogueState.error,'network failed');
 // The global search starts a fresh search across years, even from another view.
 const searchState={catalogYear:'2024',offset:48,sort:'rank',activeQuery:'Old',tag:'日常',category:'1',view:'collection',reload:0};const searchContext={query:'  New anime  '};
 for(const name of Object.keys(searchState))searchContext['set'+name[0].toUpperCase()+name.slice(1)]=value=>searchState[name]=typeof value==='function'?value(searchState[name]):value;
 vm.createContext(searchContext);vm.runInContext(handler('search'),searchContext);searchContext.search({preventDefault(){}});assert.equal(searchState.catalogYear,'','global search must not inherit a hidden year filter');assert.equal(searchState.activeQuery,'New anime');assert.equal(searchState.offset,0);assert.equal(searchState.view,'discover');
 console.log('PASS: legacy abort APIs, network/JSON/body timeout errors, backup validation/theme restore, repeat imports and failed file reads');
})().catch(error=>{console.error(error);process.exitCode=1;});
