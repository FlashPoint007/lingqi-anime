const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let now=Date.now();const storage=new Map();
function load(file,deps={},clock=Date){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>deps[name],URLSearchParams,Date:clock});return exports;}
const catalog=load('lib/catalog.ts'),deps={'./catalog':catalog,'./personal-data':{readStorage:key=>storage.get(key),writeStorage:(key,value)=>storage.set(key,value)}},restart=()=>load('lib/browse-client.ts',deps,{now:()=>now}),cache=restart();
const key=(q,page=1)=>new URLSearchParams({mode:'date',q,tag:'',cat:'',year:'',page:String(page)}).toString();
const value={data:[{id:7,name:'Example'}],total:65,page:1,offline:false,searchLimited:false};
cache.saveBrowseCache(key('A'),value);assert.equal(cache.readBrowseCache(key('A')).data[0].id,7);assert.equal(cache.readBrowseCache(key('B')),undefined);assert.equal(cache.readBrowseCache(key('A',2)),undefined);
assert.ok(cache.browseCacheFresh(cache.readBrowseCache(key('A'))));now+=120001;assert.equal(cache.browseCacheFresh(cache.readBrowseCache(key('A'))),false);assert.ok(restart().readBrowseCache(key('A')),'public lists survive reload');
assert.throws(()=>cache.browseData({...value,total:-1}));assert.throws(()=>cache.browseData({...value,data:[null]}));assert.throws(()=>cache.browseData({...value,data:Array.from({length:21},(_,i)=>({id:i+1,name:'Too many'}))}));
cache.saveBrowseCache(key('wrong',2),value);assert.equal(cache.readBrowseCache(key('wrong',2)),undefined,'responses cannot migrate to a different page');
cache.saveBrowseCache(key('offline'),{...value,offline:true});assert.equal(cache.readBrowseCache(key('offline')),undefined,'built-in fallback never replaces live cached data');
cache.saveBrowseCache(key('stale'),{...value,cacheStale:true});assert.equal(cache.browseCacheFresh(cache.readBrowseCache(key('stale'))),false,'server stale fallback never counts as freshly fetched');
for(let i=0;i<20;i++){now++;cache.saveBrowseCache(key('Entry '+i),value);}assert.equal(Object.keys(JSON.parse(storage.get('kw-browse-cache-v1'))).length,6);assert.ok(storage.get('kw-browse-cache-v1').length<=700000);
now+=86400001;assert.equal(cache.readBrowseCache(key('Entry 19')),undefined);assert.equal(restart().readBrowseCache(key('Entry 19')),undefined);
storage.set('kw-browse-cache-v1','broken');assert.equal(restart().readBrowseCache(key('Entry 19')),undefined);
console.log('PASS: search/filter/page cache isolation, reload persistence, short freshness, malformed response rejection, bounded storage and stale/offline safety');
