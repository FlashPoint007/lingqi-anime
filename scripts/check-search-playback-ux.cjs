const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules=new Map(),plain=value=>JSON.parse(JSON.stringify(value));
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,Date,Intl,require:name=>load(path.resolve(path.dirname(file),name+'.ts'))});return exports;}
const search=load('lib/search-query.ts'),playback=load('lib/playback-recovery.ts'),tests=[];
const test=(name,fn)=>tests.push([name,fn]);
test('ordinary title apostrophes and sequel primes survive search parsing',()=>{
 for(const value of ["银魂'","BanG Dream! It's MyGO!!!!!","Alice's Story","WORKING'!!","'Tis the Season"]){assert.equal(search.parseSearchQuery(value).keyword,value);assert.equal(search.shortcutSearchParams(new URLSearchParams({q:value})).get('q'),value);}
});
test('literal title punctuation survives beside explicit shortcut filters',()=>{
 const parsed=search.parseSearchQuery("BanG Dream! It's MyGO!!!!! tag:'原创' score:7..10");assert.equal(parsed.keyword,"BanG Dream! It's MyGO!!!!!");assert.equal(parsed.filters.tags,'原创');assert.equal(parsed.filters.scoreMin,'7');
 const sequel=search.parseSearchQuery("银魂' season:2011Q2");assert.equal(sequel.keyword,"银魂'");assert.equal(sequel.filters.dateFrom,'2011-03-01');
 const leading=search.parseSearchQuery("'Tis the Season tag:'原创'");assert.equal(leading.keyword,"'Tis the Season");assert.equal(leading.filters.tags,'原创');
});
test('quoted phrases and filter values remain usable without leaking quote syntax',()=>{
 assert.equal(search.parseSearchQuery('"银魂\'"').keyword,"银魂'");assert.equal(search.parseSearchQuery('"Fate Zero" "Unlimited Blade Works"').keyword,'Fate Zero Unlimited Blade Works');
 assert.equal(search.parseSearchQuery('tag:"slice of life" "K-ON!"').filters.tags,'slice of life');assert.equal(search.parseSearchQuery('tag:"slice of life" "K-ON!"').keyword,'K-ON!');
 assert.throws(()=>search.parseSearchQuery('tag:"slice of life'),/引号/);assert.equal(search.parseSearchQuery('"ID:INVADED"').keyword,'ID:INVADED');
});
test('the first source lookup and its recovery retries share one time budget',()=>{
 let now=1000;const recovery=playback.createPlaybackRecovery(()=>now),target={subjectId:7,number:2};recovery.begin(target,true);now+=60000;assert.equal(recovery.remaining(),30000,'searching for the first source must consume the same recovery budget');assert.equal(recovery.claim(target),true);assert.equal(recovery.remaining(),30000,'the first error must not reset the spent lookup budget');now+=30001;assert.equal(recovery.claim(target),false);assert.equal(recovery.remaining(),0);
 recovery.begin(target,true);assert.equal(recovery.remaining(),90000,'an explicit user retry starts a fresh window');recovery.confirmed();now+=120000;assert.equal(recovery.claim(target),true,'a later stall after successful playback gets a new recovery window');assert.equal(recovery.remaining(),90000);
});
let failed=0;for(const [name,fn]of tests)try{fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}console.log('UX CHECKS='+tests.length+' FAILED='+failed);process.exitCode=failed?1:0;
