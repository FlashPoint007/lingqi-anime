import {shortcutSearchParams} from '../../../lib/search-query';
import {browserDownload,prepareBrowserDownload} from '../../../lib/browser-download-server';
import {parseSearchFilters,searchFilterKeys} from '../../../lib/search-filters';
import {discussionResponse} from '../../../lib/discussion-server';
import {publicComments,discussionScope} from '../../../lib/discussions';
import {loadSubjectPeople} from '../../../lib/subject-people';
import {danmakuResponse} from '../../../lib/danmaku-server';
import {siteRules} from '../../../lib/site-rules';
import {subjectCover} from '../../../lib/subject-cover';
import {emailAuthResponse} from '../../../lib/email-auth';
import {cachedJson} from '../../../lib/server-cache';
import {libraryResponse} from '../../../lib/library-server';
import {readRequestText,RequestLimitError} from '../../../lib/request-guard';
import {apiRequest,apiSearch,apiChapters,extractMedia} from '../../../lib/rule-api';
import {publicUrl,validateRule,sourcePageError} from '../../../lib/web-core';
import {browseCatalog,seasonCatalog} from '../../../lib/catalog-server';
import {normalizeSubject,normalizeEpisodes,normalizeRelatedSubjects} from '../../../lib/catalog';
import {boundedText,proxyMedia,resolvePlayback,signedMediaUrl} from '../../../lib/playback-server';
function discard(response:Response){void response.body?.cancel().catch(()=>{});}
const UA='KazumiWeb/0.1 (+https://github.com/Predidit/Kazumi)';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':status>=400?'no-store':'private, max-age=60'}});
async function upstream(url:string,init:RequestInit={}) {
 const deadline=AbortSignal.timeout(12000);const res=await fetch(url,{...init,headers:{'User-Agent':UA,'Accept':'application/json',...init.headers},signal:init.signal?AbortSignal.any([init.signal,deadline]):deadline});
 if(!res.ok){discard(res);throw new Error('上游请求失败（'+res.status+'）');} return JSON.parse(await boundedText(res));
}
export async function GET(req:Request) {
 const u=new URL(req.url); const kind=u.pathname.split('/').pop();
 try {
  if(kind==='danmaku')return await danmakuResponse(u.searchParams);
  if(kind==='library')return await libraryResponse(req);
  if(kind==='discussions'){
   if(u.searchParams.get('provider')!=='bangumi')return await discussionResponse(req);
   const id=u.searchParams.get('subject')||'',episode=u.searchParams.get('episodeId')||'',page=Math.max(1,Math.min(500,Math.floor(Number(u.searchParams.get('page'))||1)));
   if(!/^[1-9]\d{0,9}$/.test(id)||episode&&!/^[1-9]\d{0,9}$/.test(episode))return json({error:'讨论条目无效'},400);discussionScope(u.searchParams.get('episode'));
   if(u.searchParams.get('episode')&&!episode)return json({error:'尚未找到这一集的 Bangumi 讨论编号'},400);
   return await cachedJson('bangumi-discussion',id+':'+episode+':'+page,async()=>{
    if(episode){const detail=await upstream('https://api.bgm.tv/v0/episodes/'+episode);if(detail.subject_id!==Number(id))throw new Error('讨论剧集与番剧不一致');}
    const raw=await upstream(episode?'https://next.bgm.tv/p1/episodes/'+episode+'/comments':'https://next.bgm.tv/p1/subjects/'+id+'/comments?limit=20&offset='+((page-1)*20));
    return {...publicComments(raw,!!episode,(page-1)*20),page,authenticated:false};
   },{ttl:300000,stale:3600000,background:true});
  }
  if(kind==='media')return proxyMedia(req);
  if(kind==='download')return browserDownload(req);
  if(kind==='cover')return await subjectCover(u.searchParams.get('id')||'',req.signal);
  if(kind==='catalog') {
   let params=new URLSearchParams();for(const key of ['mode','year','quarter','q','literal','tag','cat','page','offset',...searchFilterKeys])if(u.searchParams.has(key))params.set(key,u.searchParams.get(key)!);params.sort();
   try{params=shortcutSearchParams(params);parseSearchFilters(params);}catch(e){return json({error:e instanceof Error?e.message:'筛选条件无效'},400);}
   return await cachedJson('catalog',(u.searchParams.get('mode')==='calendar'?'calendar-v2:':'browse-v6:')+params.toString(),()=>u.searchParams.get('mode')==='calendar'?seasonCatalog(u.searchParams,upstream):browseCatalog(u.searchParams,upstream),{background:true,ttl:u.searchParams.get('mode')==='calendar'?3600000:300000,stale:u.searchParams.get('mode')==='calendar'?7*86400000:86400000,refresh:u.searchParams.get('refresh')==='1'});
  }
  if(kind==='people'){const id=u.searchParams.get('id')||'';if(!/^\d{1,10}$/.test(id))return json({error:'无效条目 ID'},400);return await cachedJson('people','v2:'+id,()=>loadSubjectPeople(id,upstream),{background:true,ttl:21600000,stale:86400000,refresh:u.searchParams.get('refresh')==='1'});}
  if(kind==='subject'||kind==='episodes'||kind==='related') {
   const id=u.searchParams.get('id')||''; if(!/^\d{1,10}$/.test(id)) return json({error:'无效条目 ID'},400);
   const offset=Math.floor(Math.min(10000,Math.max(0,Number(u.searchParams.get('offset'))||0)));
   return await cachedJson(kind,id+':'+offset,async()=>{
    if(kind==='related')return {data:normalizeRelatedSubjects(await upstream('https://api.bgm.tv/v0/subjects/'+id+'/subjects'),Number(id))};
    const data=await upstream(kind==='subject'?'https://api.bgm.tv/v0/subjects/'+id:'https://api.bgm.tv/v0/episodes?subject_id='+id+'&type=0&limit=100&offset='+offset);
    if(kind==='episodes')return normalizeEpisodes(data);
    const subject=normalizeSubject(data);if(!subject||subject.id!==Number(id))throw new Error('番剧详情格式不正确，请重试');return subject;
   },{background:true,ttl:kind==='subject'?21600000:600000,stale:86400000,refresh:u.searchParams.get('refresh')==='1'});
  }
  if(kind==='rules') {
   const data=await siteRules(u.searchParams.get('refresh')==='1'),batch=u.searchParams.get('batch'),name=u.searchParams.get('name');
   if(batch||name){const names=batch?batch.split(','):[name!];if(names.length>10)return json({error:'规则批次无效'},400);const entries=names.map(file=>{const entry=data.entries.find(e=>e.file===file);return entry?{...entry,fresh:!data.stale}:{file,error:'该规则不在全站有效目录中'};});return json(batch?{entries,checkedAt:data.checkedAt}:entries[0]);}
   return json(data);
  }
  return json({error:'接口不存在'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'请求失败，请稍后重试'},502);}
}
export async function POST(req:Request) {
 if(new URL(req.url).pathname==='/api/download')return prepareBrowserDownload(req);
 if(new URL(req.url).pathname==='/api/discussions')return discussionResponse(req);
 if(new URL(req.url).pathname==='/api/auth')return emailAuthResponse(req);
 if(new URL(req.url).pathname==='/api/library')return libraryResponse(req);
 if(!new URL(req.url).pathname.endsWith('/source')) return json({error:'接口不存在'},404);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin) return json({error:'跨站请求被拒绝'},403);
 try {
  const raw=await readRequestText(req);
  const body=JSON.parse(raw);const rule=validateRule(body.rule);
  body.operation??=body.search?'search':'chapters';
  if(body.operation==='resolve'){
   const page=publicUrl(String(body.url));if(page.origin!==publicUrl(rule.baseURL).origin)throw new Error('播放页面必须与规则同源');
   let declared:string|undefined;
   if(rule.chapterMode==='api'&&body.source&&page.hostname!=='next.xifanacg.com'){
    const spec=apiRequest(rule,'chapters',{source:String(body.source).slice(0,200),keyword:''});const response=await fetch(spec.url,{...spec.init,redirect:'manual',signal:AbortSignal.any([req.signal,AbortSignal.timeout(12000)])});if(!response.ok){discard(response);throw new Error('源站 API 响应 '+response.status);}
    const data=JSON.parse(await boundedText(response));const roads=apiChapters(data,spec.config,String(body.source));declared=roads.flatMap(road=>road.episodes).find(ep=>ep.url===page.href)?.mediaUrl;
   }
   const resolved=await resolvePlayback(rule,page.href,declared,req.signal);
   if(!resolved.media)return json({mode:'unavailable',sourceUrl:page.href,message:resolved.reason||'当前线路暂不能在本站解析，请切换线路或视频源'});
   return json({mode:'video',url:await signedMediaUrl(resolved.media,resolved.referer),mediaUrl:resolved.media,sourceUrl:page.href,verified:resolved.verified,preferDirect:new URL(resolved.referer).hostname==='next.xifanacg.com'&&!/\.m3u8(?:[?#]|$)/i.test(resolved.media),mediaType:/\.m3u8(?:[?#]|$)/i.test(resolved.media)?'hls':'video'});
  }
  if(!['search','chapters'].includes(body.operation))throw new Error('无效的源查询操作');
  const sensitive=/authorization|api[-_]?key|password|access[-_]?token|bearer/i.test(JSON.stringify([rule,body.url]));
  if(sensitive)return json(await loadSourceData(body,rule));
  const identity=JSON.stringify({rule,url:body.url,operation:body.operation,keyword:body.keyword||'',source:body.source||''});
  return await cachedJson('source-'+body.operation,identity,()=>loadSourceData(body,rule),{ttl:body.operation==='chapters'?600000:120000,stale:3600000,refresh:body.refresh===true});
 }catch(e){return json({error:e instanceof Error?e.message:'源站访问失败'},e instanceof RequestLimitError?e.status:400);}
}
async function loadSourceData(body:any,rule:ReturnType<typeof validateRule>){
  const signal=AbortSignal.timeout(15000);
  if((body.operation==='search'?rule.searchMode:rule.chapterMode)==='api'){
   const operation=body.operation as 'search'|'chapters';const vars={keyword:String(body.keyword||'').slice(0,120),source:String(body.source||'').slice(0,200)};const request=apiRequest(rule,operation,vars);
   const response=await fetch(request.url,{...request.init,redirect:'manual',signal});if(!response.ok){discard(response);throw new Error('源站 API 响应 '+response.status);}const data=JSON.parse(await boundedText(response));return operation==='search'?{results:apiSearch(data,request.config,rule)}:{roads:apiChapters(data,request.config,vars.source)};
  }
  let target=publicUrl(body.url); const base=publicUrl(rule.baseURL);
  if(target.origin!==base.origin)throw new Error('地址必须与规则站点同源');
  let method=body.search&&rule.usePost?'POST':'GET';let form:string|undefined;
  if(method==='POST'){form=target.searchParams.toString();target.search='';}
  let response:Response|undefined;
  for(let i=0;i<4;i++){
   response=await fetch(target.href,{method,body:form,headers:{'User-Agent':UA,'Accept':'text/html',...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},redirect:'manual',signal});
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');discard(response);if(!location) throw new Error('重定向无目标');const next=publicUrl(new URL(location,target).href);if(next.origin!==base.origin) throw new Error('源站跳转至其他域名，请更新规则');target=next;if(response.status===303){method='GET';form=undefined;}continue;}
   break;
  }
  if(!response?.ok){if(response)discard(response);throw new Error('源站响应 '+response?.status+'，可能需要验证或规则已失效');}
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('text/plain')){discard(response);throw new Error('源站没有返回 HTML');}
  const html=await boundedText(response);
  const pageError=sourcePageError(html);if(pageError)throw new Error(pageError);
  return {html,url:target.href,media:extractMedia(html,target.href)};
}
export const HEAD=GET;
