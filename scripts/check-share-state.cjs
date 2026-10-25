const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const shared={exports:{},URL,location:{origin:'https://site.example'},require:name=>require('./check-feature-deps.cjs').dependency(name)};vm.runInNewContext(compile('lib/share-links.ts'),shared);
const tick=async()=>{for(let n=0;n<5;n++)await new Promise(resolve=>setImmediate(resolve));};
function nodes(tree,type){const out=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type===type)out.push(node);[node.props?.children].flat(Infinity).forEach(walk);}walk(tree);return out;}
function mount(writeText,hash='#search?q=first'){
 const slots=[],effects=[];let cursor=0,scheduled=false,stopped=false,tree,lateUpdates=0;
 const schedule=()=>{if(scheduled||stopped)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!stopped)render();});};
 const react={useState(value){const i=cursor++;if(!slots[i])slots[i]={value};return [slots[i].value,value=>{if(stopped){lateUpdates++;return;}slots[i].value=typeof value==='function'?value(slots[i].value):value;schedule();}];},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,n)=>value!==old.deps[n])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props)=>({type,props}),context={exports:{},navigator:{clipboard:{writeText}},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('share-links')?shared.exports:{Share2:'Icon'}};
 vm.runInNewContext(compile('components/ShareButton.tsx'),context);
 function render(){cursor=0;tree=context.exports.default({hash});effects.splice(0).forEach(fn=>fn());}render();
 return {copy:()=>nodes(tree,'button')[0].props.onClick(),change(next){hash=next;render();},manual:()=>nodes(tree,'input').map(n=>n.props.value),message:()=>nodes(tree,'small').map(n=>n.props.children).join(''),stop(){stopped=true;slots.forEach(slot=>slot?.cleanup?.());},get lateUpdates(){return lateUpdates;}};
}
(async()=>{
 const denied=mount(async()=>{throw Error('clipboard denied');});await denied.copy();await tick();assert.equal(denied.manual()[0],'https://site.example/#search?q=first');denied.change('#search?q=second');await tick();assert.equal(denied.manual().length,0,'changing filters must remove the old manual share URL');assert.equal(denied.message(),'');denied.stop();
 let rejectOld;const pending=mount(()=>new Promise((_,reject)=>rejectOld=reject));const copy=pending.copy();pending.change('#search?q=new');await tick();rejectOld(Error('denied'));await copy;await tick();assert.equal(pending.manual().length,0,'a late clipboard failure must not restore a link from old filters');assert.equal(pending.message(),'');pending.stop();
 let resolveOld;const leaving=mount(()=>new Promise(resolve=>resolveOld=resolve));const late=leaving.copy();leaving.stop();resolveOld();await late;assert.equal(leaving.lateUpdates,0,'a completed clipboard request must not update an unmounted control');
 const waits=[];const latest=mount(()=>new Promise((resolve,reject)=>waits.push({resolve,reject})));const old=latest.copy(),newer=latest.copy();waits[1].resolve();await newer;waits[0].reject(Error('older request rejected'));await old;await tick();assert.equal(latest.manual().length,0);assert.equal(latest.message(),'链接已复制');latest.stop();
 console.log('PASS: production share links reset after filter changes; stale clipboard failures, unmounts and overlapping requests cannot restore old manual URLs or overwrite newer success');
})().catch(error=>{console.error(error);process.exitCode=1;});
