import {env,waitUntil} from 'cloudflare:workers';
type Row={key:string;kind:string;value_json:string;updated_at:number;expires_at:number;stale_until:number};
type Options={ttl:number;stale:number;refresh?:boolean;background?:boolean;timeout?:number};
type Work={task:Promise<Response>;expires:number};
const memory=new Map<string,Row>(),pending=new Map<string,Work>();const refreshing=new Map<string,Work>();let memoryBytes=0,lastCleanup=0;
const MAX_VALUE=192*1024,MAX_MEMORY=8*1024*1024,MAX_ENTRIES=1000;
function within<T>(task:Promise<T>,ms:number){
 let timer:ReturnType<typeof setTimeout>;const deadline=Date.now()+ms;
 const expired=()=>new Error('目录缓存或上游响应超时，请重试');
 return Promise.race([task.then(value=>{if(Date.now()>deadline)throw expired();return value;}),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(expired()),ms);})]).finally(()=>clearTimeout(timer));
}
function startWork(map:Map<string,Work>,key:string,run:()=>Promise<Response>,timeout:number){
 const work:Work={task:undefined!,expires:Date.now()+timeout+2000};
 work.task=within(Promise.resolve().then(run),timeout+2000).finally(()=>{if(map.get(key)===work)map.delete(key);});map.set(key,work);
 // Coalesced work must outlive the first visitor cancelling their request.
 // The lease also recovers a task whose timer/finalizer never ran.
 if(typeof waitUntil==='function')waitUntil(work.task.then(()=>{},()=>{}));
 return work.task;
}
export async function cacheKey(kind:string,input:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));return kind+':'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
function remember(row:Row){const old=memory.get(row.key);if(old)memoryBytes-=old.value_json.length;memory.delete(row.key);memory.set(row.key,row);memoryBytes+=row.value_json.length;while(memory.size>128||memoryBytes>MAX_MEMORY){const first=memory.keys().next().value!;memoryBytes-=memory.get(first)!.value_json.length;memory.delete(first);}}
function valid(row:Row){try{const value=JSON.parse(row.value_json);return value!==null&&typeof value==='object';}catch{return false;}}
function result(row:Row,state:string,stale=false){const value=JSON.parse(row.value_json);return Response.json(stale?{...value,cacheStale:true,...(row.kind==='catalog'?{offline:true}:{})}:value,{headers:{'Cache-Control':stale?'no-store':'private, max-age=60','X-Lingqi-Cache':state,'X-Lingqi-Storage':'d1',...(stale?{Warning:'110 - "Response is stale"'}:{})}});}
// Cache only public metadata/directories; never persist media tickets or user data.
export async function cachedJson(kind:string,input:string,load:()=>Promise<any>,options:Options):Promise<Response>{
 const timeout=options.timeout??16000,db=env.DB;if(!db)return Response.json(await within(load(),timeout),{headers:{'Cache-Control':'private, max-age=60','X-Lingqi-Cache':'disabled'}});
 const key=await cacheKey(kind,input),now=Date.now();let row=memory.get(key);
 if(row&&(row.stale_until<=now||!valid(row))){memoryBytes-=row.value_json.length;memory.delete(key);row=undefined;}
 if(row&&row.expires_at>now&&!options.refresh)return result(row,'memory');
 for(const map of [pending,refreshing])for(const [id,work]of map)if(work.expires<=now)map.delete(id);
 const work=pending.get(key);if(work)return (await work.task).clone();
 // Bound concurrent distinct misses so a cache cannot turn into a memory flood.
 if(pending.size+refreshing.size>=48){if(row&&options.background&&!options.refresh)return result(row,'stale',true);return Response.json({error:'查询较多，请稍后重试'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'3'}});}
 const task=async()=>{
  if(!row){try{row=await within(db.prepare('SELECT key,kind,value_json,updated_at,expires_at,stale_until FROM shared_cache WHERE key = ? AND stale_until > ?').bind(key,now).first<Row>(),800)||undefined;if(row&&!valid(row))row=undefined;if(row)remember(row);}catch{/* Cache outages must not take the catalogue down. */}}
  if(row&&row.expires_at>now&&!options.refresh)return result(row,'database');
  const reload=async()=>{try{
   const value=await within(load(),timeout);if(value?.offline){if(row&&row.stale_until>Date.now())return result(row,'stale',true);return Response.json(value,{headers:{'Cache-Control':'no-store','X-Lingqi-Cache':'fallback'}});}
   const json=JSON.stringify(value),updated=Date.now();const entry:Row={key,kind,value_json:json,updated_at:updated,expires_at:updated+options.ttl,stale_until:updated+options.ttl+options.stale};
   let stored=false;
   if(new TextEncoder().encode(json).length<=MAX_VALUE){
    remember(entry);
    try{await within(db.prepare('INSERT INTO shared_cache (key,kind,value_json,updated_at,expires_at,stale_until) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,value_json=excluded.value_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at,stale_until=excluded.stale_until WHERE excluded.updated_at > shared_cache.updated_at').bind(key,kind,json,updated,entry.expires_at,entry.stale_until).run(),800);stored=true;
     if(updated-lastCleanup>60000){lastCleanup=updated;const cleanup=within(db.batch([db.prepare('DELETE FROM shared_cache WHERE key IN (SELECT key FROM shared_cache WHERE stale_until <= ? LIMIT 200)').bind(updated),db.prepare('DELETE FROM shared_cache WHERE key IN (SELECT key FROM shared_cache ORDER BY updated_at DESC LIMIT -1 OFFSET ?)').bind(MAX_ENTRIES)]),1000).then(()=>{},()=>{});if(typeof waitUntil==='function')waitUntil(cleanup);}
    }catch{/* Serve the successful response even if a cache write fails. */}
   }
   return Response.json(value,{headers:{'Cache-Control':'private, max-age=60','X-Lingqi-Cache':'miss','X-Lingqi-Storage':stored?'d1':'bypass'}});
  }catch(error){if(row&&row.stale_until>Date.now())return result(row,'stale',true);throw error;}};
  if(options.background&&!options.refresh&&row&&row.stale_until>Date.now()){
   if(!refreshing.has(key)){
    startWork(refreshing,key,reload,timeout);
   }
   return result(row,'stale-updating',true);
  }
  const update=refreshing.get(key);return update?await update.task:await reload();
 };return (await startWork(pending,key,task,timeout)).clone();
}
