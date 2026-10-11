import snapshot from './rules-snapshot.json';
const ROOT='https://raw.githubusercontent.com/Predidit/KazumiRules/main/';
const cache=new Map<string,{at:number;value:any}>();
async function read(url:string){const old=cache.get(url);if(old&&Date.now()-old.at<3600000)return old.value;const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'LingqiWeb'}});if(!r.ok)throw new Error('规则仓库响应 '+r.status);const value=await r.json();cache.set(url,{at:Date.now(),value});return value;}
export async function ruleManifest(){
 try{const entries=await read('https://api.github.com/repos/Predidit/KazumiRules/contents');return {files:entries.filter((e:any)=>e.type==='file'&&e.name.endsWith('.json')&&e.name!=='index.json').map((e:any)=>({file:e.name,sha:e.sha})),complete:true};}
 catch{const index=await read(ROOT+'index.json').catch(()=>[]);const names=new Set([...snapshot.entries.map(e=>e.file),...index.map((r:any)=>r.name+'.json')]);return {files:[...names].map(file=>({file})),complete:false};}
}
export async function ruleBatch(names:string[]){
 if(names.length>10||names.some(n=>!/^[-\p{L}\p{N} _.()]+\.json$/u.test(n)||n==='index.json'))throw new Error('规则批次无效');
 const entries=await Promise.all(names.map(async file=>{try{const rule=await read(ROOT+encodeURIComponent(file));if(!rule||typeof rule.name!=='string'||typeof rule.baseURL!=='string')throw new Error('格式无效');return {file,rule,fresh:true};}catch{const saved=snapshot.entries.find(e=>e.file===file);return saved?{...saved,fresh:false}:{file,error:'规则更新失败'};}}));
 return {entries,checkedAt:Date.now()};
}
