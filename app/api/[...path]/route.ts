import {ruleManifest,ruleBatch} from '../../../lib/rule-subscription-server';
import {apiRequest,apiSearch,apiChapters,extractMedia} from '../../../lib/rule-api';
import {publicUrl,validateRule} from '../../../lib/web-core';
import snapshot from '../../../lib/catalog-snapshot.json';
const UA='KazumiWeb/0.1 (+https://github.com/Predidit/Kazumi)';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, max-age=60'}});
async function upstream(url:string,init:RequestInit={}) {
 const res=await fetch(url,{...init,headers:{'User-Agent':UA,'Accept':'application/json',...init.headers},signal:AbortSignal.timeout(12000)});
 if(!res.ok) throw new Error('上游请求失败（'+res.status+'）'); return res.json() as Promise<any>;
}
export async function GET(req:Request) {
 const u=new URL(req.url); const kind=u.pathname.split('/').pop();
 try {
  if(kind==='catalog') {
   const q=(u.searchParams.get('q')||'').slice(0,120); const mode=u.searchParams.get('mode')||'popular';
   const offset=Math.min(1000,Math.max(0,Number(u.searchParams.get('offset'))||0));
   if(mode==='calendar') return json({calendar:await upstream('https://api.bgm.tv/calendar')});
   try {const data=await upstream('https://api.bgm.tv/v0/search/subjects?limit=24&offset='+offset,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:q,sort:mode==='rank'?'rank':'heat',filter:{type:[2],nsfw:false,...(mode==='rank'?{rank:['>0','<=99999']}:{}),...(u.searchParams.get('tag')?{tag:[u.searchParams.get('tag')]}:{})}})});return json({...data,offline:false});}
   catch(e){if(q||offset||u.searchParams.get('tag')) throw e;return json({...snapshot,offline:true});}
  }
  if(kind==='subject'||kind==='episodes') {
   const id=u.searchParams.get('id')||''; if(!/^\d{1,10}$/.test(id)) return json({error:'无效条目 ID'},400);
   const offset=Math.min(10000,Math.max(0,Number(u.searchParams.get('offset'))||0));
   return json(await upstream(kind==='subject'?'https://api.bgm.tv/v0/subjects/'+id:'https://api.bgm.tv/v0/episodes?subject_id='+id+'&type=0&limit=100&offset='+offset));
  }
  if(kind==='rules') {
   const batch=u.searchParams.get('batch');
   if(batch)return json(await ruleBatch(batch.split(',')));
   const name=u.searchParams.get('name');if(name)return json((await ruleBatch([name])).entries[0]);
   return json(await ruleManifest());
  }
  return json({error:'接口不存在'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'请求失败，请稍后重试'},502);}
}
export async function POST(req:Request) {
 if(!new URL(req.url).pathname.endsWith('/source')) return json({error:'接口不存在'},404);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin) return json({error:'跨站请求被拒绝'},403);
 try {
  const raw=await req.text(); if(raw.length>65536) return json({error:'请求过大'},413);
  const body=JSON.parse(raw);const rule=validateRule(body.rule);
  if(rule.searchMode==='api'&&(body.operation==='search'||body.operation==='chapters')){
   const operation=body.operation as 'search'|'chapters';const vars={keyword:String(body.keyword||'').slice(0,120),source:String(body.source||'').slice(0,200)};const request=apiRequest(rule,operation,vars);
   const response=await fetch(request.url,{...request.init,redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('源站 API 响应 '+response.status);const text=await response.text();if(text.length>2097152)throw new Error('API 响应过大');const data=JSON.parse(text);return json(operation==='search'?{results:apiSearch(data,request.config)}:{roads:apiChapters(data,request.config,vars.source)});
  }
  let target=publicUrl(body.url); const base=publicUrl(rule.baseURL);
  if(target.origin!==base.origin) return json({error:'地址必须与规则站点同源'},400);
  let method=body.search&&rule.usePost?'POST':'GET';let form:string|undefined;
  if(method==='POST'){form=target.searchParams.toString();target.search='';}
  let response:Response|undefined;
  for(let i=0;i<4;i++){
   response=await fetch(target.href,{method,body:form,headers:{'User-Agent':UA,'Accept':'text/html',...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location) throw new Error('重定向无目标');const next=publicUrl(new URL(location,target).href);if(next.origin!==base.origin) throw new Error('源站跳转至其他域名，请更新规则');target=next;if(response.status===303){method='GET';form=undefined;}continue;}
   break;
  }
  if(!response?.ok) throw new Error('源站响应 '+response?.status+'，可能需要验证或规则已失效');
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('text/plain')) throw new Error('源站没有返回 HTML');
  const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error('源站页面超过 2 MB');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const charset=type.match(/charset=([^;\s]+)/i)?.[1]||'utf-8';let html:string;try{html=new TextDecoder(charset).decode(bytes);}catch{html=new TextDecoder().decode(bytes);}
  return json({html,url:target.href,media:extractMedia(html,target.href)});
 }catch(e){return json({error:e instanceof Error?e.message:'源站访问失败'},400);}
}
