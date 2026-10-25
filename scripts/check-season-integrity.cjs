const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const plain=value=>JSON.parse(JSON.stringify(value));
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-25T12:00:00Z']));}static now(){return new Date('2026-10-25T12:00:00Z').getTime();}}
const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,AbortSignal,AbortController,DOMException,Date:Clock,Intl,setTimeout,clearTimeout,console,require:name=>name.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),name),'utf8')):load(path.resolve(path.dirname(file),name+'.ts'))});return exports;}
const catalog=load('lib/catalog.ts'),server=load('lib/catalog-server.ts'),identity=load('lib/source-identity.ts');
const item=(id,date='2025-01-06')=>({id,name:'Anime '+id,date}),feed=(items,day=1)=>Object.fromEntries(Array.from({length:7},(_,i)=>[String(i+1),i+1===day?items.map(subject=>({subject})):[]]));
const allItems=result=>result.calendar.flatMap(day=>day.items),tests=[];
const test=(name,fn)=>tests.push([name,fn]);
test('all 2024–2026 season ranges match Kazumi, including winter crossing the year',()=>{
 for(const year of [2024,2025,2026])for(const quarter of [1,2,3,4]){const expected=[{start:(year-1)+'-12-01',end:year+'-03-01'},{start:year+'-03-01',end:year+'-06-01'},{start:year+'-06-01',end:year+'-09-01'},{start:year+'-09-01',end:year+'-12-01'}][quarter-1];assert.deepEqual(plain(catalog.seasonRange(year,quarter)),expected);}
 for(const [year,quarter]of [[1899,1],[2101,1],[2026,0],[2026,5],[2026,1.5]])assert.throws(()=>catalog.seasonRange(year,quarter));
});
test('all twelve mirror requests preserve the requested season and weekday buckets',async()=>{
 for(const year of [2024,2025,2026])for(const quarter of [1,2,3,4]){
  if(year===2026&&quarter===4)continue;const expected=catalog.seasonRange(year,quarter),subject=item(year*10+quarter,expected.start);
  const result=await server.seasonCatalog(new URLSearchParams({year,quarter}),async url=>{const u=new URL(url);assert.match(u.pathname,/calendar\/season$/);assert.equal(u.searchParams.get('start'),expected.start);assert.equal(u.searchParams.get('end'),expected.end);return feed([subject],4);});
  assert.equal(result.year,year);assert.equal(result.quarter,quarter);assert.equal(result.calendar[3].items[0].id,subject.id);assert.equal(allItems(result).length,1);assert.equal(result.complete,true);assert.equal(result.offline,undefined);
 }
});
test('current weekly calendar keeps continuing shows instead of filtering their premiere dates',async()=>{
 const result=await server.seasonCatalog(new URLSearchParams('year=2026&quarter=4'),async url=>{assert.match(url,/\/p1\/calendar$/);return feed([item(17,'1999-10-20')],7);});assert.equal(result.basis,'current');assert.equal(result.calendar[6].items[0].id,17);assert.equal(result.complete,true);
});
test('duplicate first-page entries cannot suppress later fallback pages',async()=>{
 const offsets=[];const result=await server.seasonCatalog(new URLSearchParams('year=2025&quarter=1'),async url=>{if(url.includes('kazumi.fyi'))throw Error('archive unavailable');const offset=Number(new URL(url).searchParams.get('offset'));offsets.push(offset);return {total:40,data:Array.from({length:20},(_,i)=>item(offset===0&&i===19?19:offset+i+1))};});
 assert.deepEqual(offsets,[0,20]);assert.equal(allItems(result).length,39);assert.equal(result.complete,false);assert.equal(result.offline,true);
});
test('fallback rejects impossible, unknown and out-of-season premiere dates without claiming completeness',async()=>{
 const result=await server.seasonCatalog(new URLSearchParams('year=2025&quarter=1'),async url=>{if(url.includes('kazumi.fyi'))throw Error('archive unavailable');return {total:6,data:[item(1,'2024-12-01'),item(2,'2025-02-28'),item(3,'2025-02-31'),item(4,'2025-03-01'),item(5,''),item(6,'2024-11-30')]};});
 assert.deepEqual(plain(allItems(result).map(s=>s.id).sort()),[1,2]);assert.equal(result.complete,false);assert.match(result.notice,/条目|日期|不完整/);
});
test('an archive response containing another season falls back instead of being relabelled',async()=>{
 const result=await server.seasonCatalog(new URLSearchParams('year=2025&quarter=1'),async url=>url.includes('kazumi.fyi')?feed([item(1,'2026-01-06')]):{total:1,data:[item(2)]});assert.equal(result.offline,true);assert.deepEqual(plain(allItems(result).map(s=>s.id)),[2]);
});
test('source matching preserves sequel primes, degrees and terminal dots',()=>{
 for(const [source,target]of [["银魂'",'银魂'],['银魂°','银魂'],['银魂.','银魂'],["WORKING'!!",'WORKING!!'],['银魂°',"银魂'"]])assert.equal(identity.matchesTitle(source,[target],{eps:12,platform:'TV'}),false,source+' must not match '+target);
 assert.equal(identity.matchesTitle('銀魂′',["銀魂'"],{eps:51,platform:'TV'}),true);assert.equal(identity.matchesTitle('銀魂’',["銀魂'"],{eps:51,platform:'TV'}),true);
 assert.equal(identity.matchesTitle('Dr. STONE',['Dr STONE'],{eps:24,platform:'TV'}),true,'cosmetic abbreviation punctuation remains optional');
 assert.equal(identity.matchesTitle("Alice's Story",['Alices Story'],{eps:12,platform:'TV'}),true,'apostrophes within a word are not sequel markers');
});
test('explicit Chinese and Arabic season numbers match while different seasons and parts stay distinct',()=>{
 const tv={eps:12,platform:'TV'};for(const [source,target]of [['夏目友人帐第2季','夏目友人帐第二季'],['Example Season 2','Example 第二季'],['Example 第十二期','Example Season 12']])assert.equal(identity.matchesTitle(source,[target],tv),true,source+' should match '+target);
 for(const [source,target]of [['Example 第二季','Example 第三季'],['Example 第2季','Example'],['Example Season 2 Part 1','Example Season 2 Part 2']])assert.equal(identity.matchesTitle(source,[target],tv),false);
});
(async()=>{let failures=0;for(const [name,fn]of tests)try{await fn();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}console.log('SEASON CHECKS='+tests.length+' FAILED='+failures);process.exitCode=failures?1:0;})().catch(error=>{console.error(error);process.exitCode=1;});
