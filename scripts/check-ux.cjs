const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>deps[name],Date,Intl,...globals});return exports;}
const catalog=load('lib/catalog.ts');
assert.equal(catalog.scoreLabel(0),'暂无评分');assert.equal(catalog.scoreLabel(NaN),'暂无评分');assert.equal(catalog.scoreLabel(8.46),'8.5');
const years=catalog.catalogYears([{id:1,name:'Future',date:'2029-01-01'}],2026);assert.equal(years[0],2029);assert.ok(years.includes(1950));assert.equal(years.at(-1),1900);
assert.equal(catalog.catalogYears([],2026,'2029')[0],2029,'the selected year remains visible while a request empties the list');
const document={activeElement:null,querySelectorAll:()=>dialogs};let dialogs=[];
const modal=load('lib/modal-focus.ts',{}, {document}).modalKey;
function control({disabled=false,hidden=false,tabIndex=0}={}){return {tabIndex,matches:()=>disabled||hidden,getClientRects:()=>hidden?[]:[{}],focus(){document.activeElement=this;}};}
const first=control(),hidden=control({hidden:true}),disabled=control({disabled:true}),last=control(),outside=control();
const dialog={querySelectorAll:()=>[first,hidden,disabled,last],contains:el=>[first,hidden,disabled,last].includes(el),focus(){document.activeElement=this;}};
dialogs=[dialog];let closed=0;
function key(name,shift=false){const event={key:name,shiftKey:shift,preventDefault(){this.prevented=true;}};modal(event,dialog,()=>closed++);return event;}
document.activeElement=last;assert.equal(key('Tab').prevented,true);assert.equal(document.activeElement,first);
document.activeElement=first;key('Tab',true);assert.equal(document.activeElement,last);
document.activeElement=outside;key('Tab');assert.equal(document.activeElement,first,'focus outside an open modal returns to it');
const above={};dialogs=[dialog,above];key('Escape');assert.equal(closed,0,'a background dialog cannot consume Escape from the topmost dialog');
dialogs=[dialog];key('Escape');assert.equal(closed,1);
dialog.querySelectorAll=()=>[hidden,disabled];assert.equal(key('Tab').prevented,true);assert.equal(document.activeElement,dialog);
const jsx=(type,props)=>({type,props}),react={useState:()=>['2',()=>{}]};
const Pagination=load('components/Pagination.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'../lib/catalog':catalog}).default;
let changes=0;const tree=Pagination({page:1,pages:4,total:80,disabled:true,onChange:()=>changes++});
const form=tree.props.children.find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});assert.equal(changes,0,'Enter cannot navigate while the pager is disabled');
console.log('PASS: unknown scores, future/old year filters, modal visible/disabled focus boundaries, nested Escape and disabled page submission');

(async()=>{
 const source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=[];
 const walk=node=>{if(ts.isFunctionDeclaration(node)&&['sourceSearch','stopSource'].includes(node.name?.text))functions.push(node.getText(source));ts.forEachChild(node,walk);};walk(source);
 const state={sourceBusy:false,sourceTerm:'   ',sourceOperation:{current:0},sourceRequestRef:{current:null},rules:[{name:'Test',baseURL:'https://source.example',searchURL:'https://source.example/search?q=@keyword'}],ruleIdx:0,AbortController,anySignal:signals=>signals[0],timeoutSignal:()=>new AbortController().signal,results:[],calls:[],error:'',setSourceBusy:value=>state.sourceBusy=value,setSourceError:value=>state.error=value,setSourceResults:value=>state.results=value,setRoads(){},setChapterSource(){}};
 let finish;state.api=async(url,options)=>{state.calls.push({url,options});return await new Promise(resolve=>finish=resolve);};
 vm.createContext(state);vm.runInContext(ts.transpileModule(functions.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,state);
 await state.sourceSearch();assert.match(state.error,/请输入番剧名称/);assert.equal(state.calls.length,0);
 state.sourceTerm='  Frieren  ';const searching=state.sourceSearch();assert.equal(state.sourceBusy,true);assert.equal(JSON.parse(state.calls[0].options.body).keyword,'Frieren');await state.sourceSearch();assert.equal(state.calls.length,1,'Enter during a search cannot restart it');
 const signal=state.calls[0].options.signal;state.stopSource();assert.equal(signal.aborted,true);assert.equal(state.sourceBusy,false);finish({results:[{name:'late',url:'https://source.example/late'}]});await searching;assert.equal(state.results.length,0,'cancelled source responses cannot repopulate results');
 console.log('PASS: empty/trimmed source queries, duplicate submission and cancellation isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
