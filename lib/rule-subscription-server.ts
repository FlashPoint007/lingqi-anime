import snapshot from './rules-snapshot.json';
const ROOT='https://raw.githubusercontent.com/Predidit/KazumiRules/main/';
const cache=new Map<string,{at:number;value:any}>();
async function read(url:string){const old=cache.get(url);if(old&&Date.now()-old.at<3600000)return old.value;const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'LingqiWeb'}});if(!r.ok)throw new Error('规则仓库响应 '+r.status);const value=await r.json();cache.set(url,{at:Date.now(),value});return value;}
type ArchiveEntry={file:string;rule:any};
let archiveCache:{at:number;entries:ArchiveEntry[]}|undefined;
let pendingArchive:Promise<ArchiveEntry[]>|undefined;
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
  const response=await fetch('https://codeload.github.com/Predidit/KazumiRules/tar.gz/refs/heads/main',{signal:AbortSignal.timeout(20000)});if(!response.ok||!response.body)throw new Error('规则归档下载失败');
  const reader=response.body.pipeThrough(new DecompressionStream('gzip')).getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw new Error('规则仓库超过 4 MB');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const entries=parseRuleArchive(bytes);archiveCache={at:Date.now(),entries};return entries;
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
