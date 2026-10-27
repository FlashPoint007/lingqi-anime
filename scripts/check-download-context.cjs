const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const jsx=(type,props)=>({type,props}),text=node=>node==null?'':typeof node!=='object'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children);
function find(node,predicate){if(!node||typeof node!=='object')return;if(!Array.isArray(node)&&predicate(node))return node;for(const child of (Array.isArray(node)?node:[node.props?.children]).flat(Infinity)){const result=find(child,predicate);if(result)return result;}}
const button=(root,label)=>{const found=find(root.tree,node=>node.type==='button'&&text(node)===label);assert.ok(found,'Missing button '+label);return found;};
const status=root=>text(find(root.tree,node=>node.props?.role==='status'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(file,exportName,props,deps={}){
 const slots=[],effects=[],listeners=new Map();let cursor=0,dirty=false,alive=true;const root={tree:null,props};
 const schedule=()=>{if(dirty||!alive)return;dirty=true;queueMicrotask(()=>{dirty=false;if(alive)root.render();});};
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;schedule();}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const imports={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':new Proxy({},{get:()=>()=>null}),'../lib/offline-downloads':{activeDownload:()=>undefined},'../lib/download-queue':{},'../lib/browser-download-client':{},'../lib/playback-client':{episodeLabel:(name,number)=>'EP '+number},...deps};
 const context={exports:{},AbortController,console,setTimeout,clearTimeout,window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},require:name=>{assert.ok(name in imports,'Unexpected dependency '+name);return imports[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 root.render=()=>{cursor=0;root.tree=context.exports[exportName](root.props);effects.splice(0).forEach(fn=>fn());};root.update=next=>{root.props={...root.props,...next};root.render();};root.stop=()=>{alive=false;slots.forEach(slot=>slot?.cleanup?.());};root.render();return root;
}
const subject={id:41,name:'Test'},episode={owner:'anonymous',subject,episode:'EP 1',number:1,url:'/api/media?ticket=one',nativeUrl:'/api/media?ticket=one',sourceUrl:'https://source.test/1'};
const tests=[];const test=(name,run)=>tests.push([name,run]);
test('late offline progress and errors cannot appear under another episode or after unmount',async()=>{
 const work=deferred();let onStatus;const root=mount('components/OfflineDownloads.tsx','DownloadEpisode',episode,{'../lib/offline-downloads':{activeDownload:()=>undefined,downloadEpisode:(_input,notify)=>{onStatus=notify;return work.promise;}}});
 button(root,'保存到站内离线库').props.onClick();onStatus('EP 1 bytes received');await tick();assert.equal(status(root),'EP 1 bytes received');
 root.update({episode:'EP 2',number:2,sourceUrl:'https://source.test/2',nativeUrl:'/api/media?ticket=two',url:'/api/media?ticket=two'});await tick();onStatus('Wrong episode progress');await tick();assert.doesNotMatch(status(root),/Wrong episode/);
 root.update(episode);await tick();onStatus('Old request after returning to EP 1');work.reject(Error('Old download failed'));await tick();assert.doesNotMatch(status(root),/Old request|Old download/);root.stop();
 const second=deferred();let late;const unmount=mount('components/OfflineDownloads.tsx','DownloadEpisode',episode,{'../lib/offline-downloads':{activeDownload:()=>undefined,downloadEpisode:(_input,notify)=>{late=notify;return second.promise;}}});button(unmount,'保存到站内离线库').props.onClick();await tick();const before=status(unmount);unmount.stop();late('Unmounted download');second.resolve();await tick();assert.equal(status(unmount),before);
});
test('switching personal spaces clears batch selection and ignores completion from the old space',async()=>{
 const work=deferred(),inputs=[];const props={owner:'a',subject,episodes:[{name:'First',number:1,url:'https://source.test/1'}],rule:{name:'Test'},source:'https://source.test/show'};
 const root=mount('components/DownloadQueue.tsx','BatchDownloadPicker',props,{'../lib/offline-downloads':{queueOfflineEpisodes:input=>{inputs.push(input);return work.promise;}}});button(root,'选择前 1 集').props.onClick();await tick();assert.ok(!button(root,'加入下载任务（1）').props.disabled);
 const pending=button(root,'加入下载任务（1）').props.onClick();await tick();root.update({owner:'b'});await tick();assert.ok(button(root,'加入下载任务（0）').props.disabled,'selection belongs to the old personal space');work.resolve(1);await pending;await tick();assert.doesNotMatch(status(root),/已加入/);assert.equal(inputs[0][0].owner,'a');root.stop();
});
test('batch queue completion cannot clear selections made for a newly chosen road',async()=>{
 const work=deferred();const props={owner:'a',subject,episodes:[{name:'First',number:1,url:'https://source.test/1'}],rule:{name:'Test'},source:'https://source.test/show'};
 const root=mount('components/DownloadQueue.tsx','BatchDownloadPicker',props,{'../lib/offline-downloads':{queueOfflineEpisodes:()=>work.promise}});button(root,'选择前 1 集').props.onClick();await tick();const pending=button(root,'加入下载任务（1）').props.onClick();await tick();root.update({episodes:[{name:'Second',number:2,url:'https://backup.test/2'}]});await tick();button(root,'选择前 1 集').props.onClick();await tick();work.resolve(1);await pending;await tick();assert.ok(!button(root,'加入下载任务（1）').props.disabled);assert.doesNotMatch(status(root),/已加入/);root.stop();
});
test('an expired individual download link is reported as queued, not handed to the browser',async()=>{
 let sent=0;const props={owner:'a',queue:{book:{paused:false,tasks:[{id:'task',subject,episode:{name:'First'},state:'ready',download:{format:'mp4'}}]},error:'',wake(){}}};const root=mount('components/DownloadQueue.tsx','default',props,{'../lib/download-queue':{handReadyDownloads:()=>sent}});button(root,'下载到本地').props.onClick();await tick();assert.match(status(root),/过期|重新准备/);assert.doesNotMatch(status(root),/下载已请求/);sent=1;button(root,'下载到本地').props.onClick();await tick();assert.match(status(root),/下载已请求/);root.stop();
});
(async()=>{let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS: '+name);}catch(error){failed++;console.error('FAIL: '+name+'\n'+error.stack);}}if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
