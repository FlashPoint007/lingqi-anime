import snapshot from './rules-snapshot.json';
const ROOT='https://raw.githubusercontent.com/Predidit/KazumiRules/main/';
// Official Kazumi 2.4.2 mirrors. Never combine partial feeds into a deletion list.
const RULE_ROOTS=[ROOT,'https://gh-proxy.org/'+ROOT,'https://ghfast.top/'+ROOT,'https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/'];
const cache=new Map<string,{at:number;value:any}>();
async function read(url:string){const old=cache.get(url);if(old&&Date.now()-old.at<3600000)return old.value;const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'LingqiWeb'}});if(!r.ok)throw new Error('规则仓库响应 '+r.status);const value=await r.json();cache.set(url,{at:Date.now(),value});return value;}
type ArchiveEntry={file:string;rule:any};
let archiveCache:{at:number;entries:ArchiveEntry[]}|undefined;
let pendingArchive:Promise<ArchiveEntry[]>|undefined;
function indexedNames(index:any):string[]{
 if(!Array.isArray(index)||!index.length||index.length>500||index.some(e=>typeof e?.name!=='string'||!/^[-\p{L}\p{N} _.()]+$/u.test(e.name)||e.name.trim()!==e.name||e.name.length>155||e.name==='index')||new Set(index.map(e=>e.name)).size!==index.length)throw Error('有效规则索引无效');
 return index.map(e=>e.name);
}
async function indexedRules(root:string,signal:AbortSignal,reserve:()=>void):Promise<ArchiveEntry[]>{
 let total=0;
 const json=async(file:string)=>{
  signal.throwIfAborted();reserve();const response=await fetch(root+encodeURIComponent(file),{signal,headers:{Accept:'application/json','User-Agent':'LingqiWeb'},redirect:'error'});
  if(!response.ok||!response.body)throw Error('规则镜像响应 '+response.status);
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;total+=value.length;if(size>1048576||total>4*1048576)throw Error('规则仓库超过大小限制');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel().catch(()=>{});}
 };
 const names=indexedNames(await json('index.json')),entries:ArchiveEntry[]=new Array(names.length);let next=0;
 await Promise.all(Array.from({length:Math.min(3,names.length)},async()=>{while(next<names.length){const i=next++,name=names[i],file=name+'.json',rule=await json(file);if(!rule||rule.name!==name||typeof rule.baseURL!=='string')throw Error('有效规则文件不匹配：'+name);entries[i]={file,rule};}}));
 return entries.filter(e=>!e.rule.deprecated&&e.rule.baseURL.startsWith('https://')).sort((a,b)=>a.file.localeCompare(b.file));
}
async function fallbackRules():Promise<ArchiveEntry[]>{
 const requests=new Set<AbortController>(),deadline=AbortSignal.timeout(18000);let next=0,remaining=36,finished=false;
 const reserve=()=>{if(finished||remaining--<=0)throw Error('规则镜像请求已达本次上限');};
 // Two complete feeds at most, three files per feed. Failed or slow mirrors
 // advance to the next upstream endpoint within one shared deadline/budget.
 const worker=async()=>{
  while(!finished&&next<RULE_ROOTS.length&&!deadline.aborted){
   const root=RULE_ROOTS[next++],controller=new AbortController();requests.add(controller);
   try{return await indexedRules(root,AbortSignal.any([deadline,AbortSignal.timeout(10000),controller.signal]),reserve);}
   catch{if(deadline.aborted)break;}
   finally{controller.abort();requests.delete(controller);}
  }
  throw Error('规则镜像暂不可用');
 };
 try{return await Promise.any([worker(),worker()]);}
 finally{finished=true;requests.forEach(request=>request.abort());}
}
export function parseRuleArchive(bytes:Uint8Array):ArchiveEntry[]{
 const decoder=new TextDecoder();const entries:ArchiveEntry[]=[];let active:Set<string>|undefined;
 for(let offset=0;offset+512<=bytes.length;){
  const header=bytes.subarray(offset,offset+512);const name=decoder.decode(header.subarray(0,100)).split('\0')[0];if(!name)break;
  const rawSize=decoder.decode(header.subarray(124,136)).replace(/\0/g,'').trim();if(!/^[0-7]+$/.test(rawSize))throw new Error('规则仓库归档格式无效');
  const size=parseInt(rawSize,8);if(size>1048576||offset+512+size>bytes.length)throw new Error('规则仓库归档文件过大或不完整');
  if(/^KazumiRules-[^/]+\/index\.json$/.test(name)){const index=JSON.parse(decoder.decode(bytes.subarray(offset+512,offset+512+size)));if(active||!Array.isArray(index)||!index.length||index.length>500||index.some(e=>typeof e?.name!=='string'||!e.name.trim())||new Set(index.map(e=>e.name)).size!==index.length)throw new Error('有效规则索引无效');active=new Set(index.map(e=>e.name));}
  else if(/^KazumiRules-[^/]+\/[^/]+\.json$/.test(name)){
   const rule=JSON.parse(decoder.decode(bytes.subarray(offset+512,offset+512+size)));if(typeof rule.name!=='string'||typeof rule.baseURL!=='string')throw new Error('规则文件格式无效');entries.push({file:name.split('/').pop()!,rule});
  }
  offset+=512+Math.ceil(size/512)*512;
 }
 if(!entries.length||entries.length>500||!active?.size)throw new Error('规则仓库内容或有效索引无效');
 // A partial archive must never become an authoritative deletion list.
 for(const name of active)if(entries.filter(e=>e.rule.name===name&&e.file===name+'.json').length!==1)throw new Error('有效规则文件缺失或重复：'+name);
 return entries.filter(e=>active!.has(e.rule.name)&&e.file===e.rule.name+'.json'&&!e.rule.deprecated&&e.rule.baseURL.startsWith('https://')).sort((a,b)=>a.file.localeCompare(b.file));
}
export async function archiveRules(refresh=false):Promise<ArchiveEntry[]>{
 if(!refresh&&archiveCache&&Date.now()-archiveCache.at<3600000)return archiveCache.entries;if(pendingArchive)return pendingArchive;
 pendingArchive=(async()=>{
  let entries:ArchiveEntry[];
  try{
  const response=await fetch('https://codeload.github.com/Predidit/KazumiRules/tar.gz/refs/heads/main',{signal:AbortSignal.timeout(12000)});if(!response.ok||!response.body)throw new Error('规则归档下载失败');
  const reader=response.body.pipeThrough(new DecompressionStream('gzip')).getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw new Error('规则仓库超过 4 MB');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}entries=parseRuleArchive(bytes);
  }catch{entries=await fallbackRules();}
  archiveCache={at:Date.now(),entries};return entries;
 })();try{return await pendingArchive;}finally{pendingArchive=undefined;}
}
export async function ruleManifest(){
 try{const entries=await archiveRules();return {files:entries.map(e=>({file:e.file})),complete:true};}catch{}
 try{const index=await read(ROOT+'index.json');if(!Array.isArray(index)||!index.length)throw new Error('索引无效');return {files:index.map((r:any)=>({file:r.name+'.json'})),complete:true};}
 catch{return {files:snapshot.entries.filter(e=>!(e.rule as any).deprecated&&e.rule.baseURL.startsWith('https://')).map(e=>({file:e.file})),complete:false};}
}
export async function ruleBatch(names:string[]){
 if(names.length>10||names.some(n=>!/^[-\p{L}\p{N} _.()]+\.json$/u.test(n)||n==='index.json'))throw new Error('规则批次无效');
 let archive:ArchiveEntry[]=[];try{archive=await archiveRules();}catch{}
 const entries=await Promise.all(names.map(async file=>{try{const rule=archive.find(e=>e.file===file)?.rule||await read(ROOT+encodeURIComponent(file));if(!rule||typeof rule.name!=='string'||typeof rule.baseURL!=='string')throw new Error('格式无效');return {file,rule,fresh:true};}catch{const saved=snapshot.entries.find(e=>e.file===file);return saved?{...saved,fresh:false}:{file,error:'规则更新失败'};}}));
 return {entries,checkedAt:Date.now()};
}
