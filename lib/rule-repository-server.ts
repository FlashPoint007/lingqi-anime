import {normalizeRuleRepository,repositoryCatalog,type RepositoryItem} from './rule-repository';
import {ruleCompatibility} from './subscriptions';
import {validateRule,type Rule} from './web-core';

type Cached={at:number;value:RepositoryItem[]|Rule};
const cache=new Map<string,Cached>();
async function read(url:string,signal:AbortSignal){
 const response=await fetch(url,{signal,redirect:'error',headers:{Accept:'application/json','User-Agent':'LingqiWeb'}});
 if(!response.ok||!response.body){void response.body?.cancel().catch(()=>{});throw Error('规则仓库响应 '+response.status);}
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
 try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>1048576)throw Error('规则文件超过 1 MB');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
 finally{await reader.cancel().catch(()=>{});}
}
async function cached<T extends Cached['value']>(key:string,signal:AbortSignal,load:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();const old=cache.get(key);if(old&&Date.now()-old.at<300000)return old.value as T;
 const value=await load();signal.throwIfAborted();
 if(cache.size>=32)cache.delete(cache.keys().next().value!);
 cache.set(key,{at:Date.now(),value});return value;
}
export async function repositoryResponse(params:URLSearchParams,requestSignal:AbortSignal){
 let repository:string;
 try{repository=normalizeRuleRepository(params.get('repository')||'');}catch(error){return Response.json({error:(error as Error).message},{status:400});}
 const name=params.get('name');
 if(name!==null&&(name.length>160||!name.endsWith('.json')))return Response.json({error:'规则文件名无效'},{status:400});
 const signal=AbortSignal.any([requestSignal,AbortSignal.timeout(16000)]);
 try{
  const items=await cached(repository+'index.json',signal,async()=>repositoryCatalog(await read(repository+'index.json',signal)));
  if(name===null)return Response.json({repository,items},{headers:{'Cache-Control':'private, max-age=60'}});
  const item=items.find(item=>item.file===name);
  if(!item)return Response.json({error:'该规则不在当前仓库有效索引中'},{status:404});
  const rule=await cached(repository+encodeURIComponent(name),signal,async()=>{
   const value=validateRule(await read(repository+encodeURIComponent(name),signal));
   if(value.name!==item.name)throw Error('规则文件与目录名称不一致');
   const reason=ruleCompatibility(value);if(reason)throw Error(reason);
   if(new TextEncoder().encode(JSON.stringify(value)).length>60000)throw Error('规则过大，无法用于本站源请求');
   return value;
  });
  return Response.json({repository,file:item.file,rule},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'规则仓库暂不可用'},{status:502});}
}
