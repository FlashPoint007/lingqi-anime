import {boundedText} from './playback-server';
import {cachedJson} from './server-cache';
import {danmakuNames,parseBilibiliXml,parseDandanComments,parseGamerComments,limitDanmaku,type DanmakuEpisode,type DanmakuProvider,type DanmakuMatch,type DanmakuNotice} from './danmaku';
const UA='LingqiWeb/1.0 (+https://github.com/FlashPoint007/lingqi-anime)';
class DanmakuError extends Error{constructor(message:string,public status=502,public code='UPSTREAM_ERROR',public upstreamStatus?:number,public retryAfter=0){super(message);}}
const id=(s:string)=>/^[1-9]\d{0,14}$/.test(s)&&Number.isSafeInteger(Number(s));
function credentials(){const appId=process.env.LINGQI_DANDAN_APP_ID,secret=process.env.LINGQI_DANDAN_APP_SECRET;return appId&&secret?{appId,secret}:null;}
// Fixed origins only. Brief per-isolate cooldowns stop a failed source being hammered
// by remounts, automatic failover and repeated refreshes. Never cache a failure as [] .
const cooling=new Map<string,{until:number;error:DanmakuError}>();
function providerLabel(host:string){return host.endsWith('bilibili.com')?'BiliBili':host.endsWith('gamer.com.tw')?'Gamer':host==='api.dandanplay.net'?'弹弹play':'番剧索引';}
function pauseOrigin(host:string,error:DanmakuError){if(error.retryAfter>0)cooling.set(host,{until:Date.now()+error.retryAfter*1000,error});}
async function errorPrefix(response:Response){
 if(!response.body)return '';const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(size<16384){const {done,value}=await reader.read();if(done)break;const chunk=value.slice(0,16384-size);chunks.push(chunk);size+=chunk.length;}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);}catch{return '';}
 finally{void reader.cancel().catch(()=>{});}
}
function remoteFailure(host:string,status:number,text:string,headers:Headers){
 const label=providerLabel(host),maintenance=/系[统統][维維][护護修]|维护中|維護中|maintenance|temporarily unavailable/i.test(text.slice(0,16384));
 if(maintenance)return new DanmakuError(label+' 服务正在维护，请稍后再试',502,'UPSTREAM_MAINTENANCE',status,60);
 if(host==='api.dandanplay.net'&&status===403){
  const reasons:Record<string,string>={'Missing Authentication Headers':'缺少应用认证信息','Invalid Timestamp':'服务器时间或签名时间戳无效','Invalid AppId':'应用 ID 或密钥无效','Invalid Signature':'应用签名校验失败','Invalid AppSecret':'应用密钥无效'};
  return new DanmakuError('弹弹play '+(reasons[headers.get('X-Error-Message')||'']||'拒绝了当前应用请求，请检查应用授权'),502,'UPSTREAM_AUTH',status,60);
 }
 if(status===429){const value=headers.get('Retry-After')||'',raw=/^\d+$/.test(value)?Number(value):(Date.parse(value)-Date.now())/1000,seconds=Number.isFinite(raw)&&raw>0?Math.min(86400,Math.ceil(raw)):60;return new DanmakuError(label+' 请求过于频繁，请稍后再试',502,'UPSTREAM_RATE_LIMIT',status,seconds);}
 if([403,412].includes(status))return new DanmakuError(label+' 拒绝当前服务器访问（'+status+'），可切换其他来源或导入弹幕',502,'UPSTREAM_BLOCKED',status,120);
 return new DanmakuError(label+' 来源响应 '+status+'，请稍后重试',502,'UPSTREAM_ERROR',status,status>=500?30:0);
}
async function remote(url:string,headers:Record<string,string>={},max=2*1024*1024,xml=false){
 const host=new URL(url).hostname,cooldown=cooling.get(host);if(cooldown&&cooldown.until>Date.now()){const remaining=Math.ceil((cooldown.until-Date.now())/1000);throw new DanmakuError(cooldown.error.message,cooldown.error.status,cooldown.error.code,cooldown.error.upstreamStatus,remaining);}cooling.delete(host);
 const response=await fetch(url,{headers:{'User-Agent':UA,Accept:xml?'text/xml':'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok){const error=remoteFailure(host,response.status,await errorPrefix(response),response.headers);pauseOrigin(host,error);throw error;}
 const text=await boundedText(response,max,10000);
 if(/系[统統][维維][护護修]|维护中|維護中|maintenance/i.test(text.slice(0,1024))&&/<(?:html|title)\b/i.test(text.slice(0,1024))){const error=remoteFailure(host,503,text,response.headers);pauseOrigin(host,error);throw error;}
 if(xml)return text;
 try{return JSON.parse(text);}catch{throw new DanmakuError(providerLabel(host)+' 来源返回了网页或无效数据，请稍后重试',502,'UPSTREAM_FORMAT',response.status);}
}
export async function dandanRequest(path:string,query=''){
 const auth=credentials();if(!auth)throw new DanmakuError('弹弹play 尚未配置本站应用凭证，需要站长申请后配置',503,'DANDAN_NOT_CONFIGURED');
 const timestamp=String(Math.floor(Date.now()/1000)),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.appId+timestamp+path+auth.secret));
 const signature=btoa(String.fromCharCode(...new Uint8Array(bytes)));
 const data=await remote('https://api.dandanplay.net'+path+query,{'X-AppId':auth.appId,'X-Timestamp':timestamp,'X-Signature':signature});
 if(data?.success===false)throw new DanmakuError('弹弹play 请求失败，请检查应用权限、额度或稍后重试',502,'UPSTREAM_ERROR');return data;
}
type IndexedMatch=DanmakuMatch&{gamerAcgId?:string;gamerSearchTitle?:string};
function mappedProviders(items:unknown,subjectId:string):IndexedMatch[]{
 if(!Array.isArray(items))throw new DanmakuError('番剧弹幕索引格式不正确');
 const item=items.find(i=>Array.isArray(i?.sites)&&i.sites.some((s:any)=>s.site==='bangumi'&&s.id===subjectId));if(!item)return [];
 const sources:IndexedMatch[]=[];
 for(const site of item.sites){
  if(!id(String(site.id)))continue;const provider=site.site==='bilibili'?'bilibili':site.site==='gamer'?'gamer':null;if(!provider||sources.some(s=>s.provider===provider))continue;
  const title=String(item.titleTranslate?.['zh-Hans']?.[0]||item.title||'已匹配番剧').slice(0,180);
  if(provider==='bilibili')sources.push({provider,key:'md'+site.id,title});
  else if(id(String(site.video_sn)))sources.push({provider,key:String(site.video_sn),title});
  else sources.push({provider,key:'acg'+site.id,title,gamerAcgId:String(site.id),gamerSearchTitle:String(item.titleTranslate?.['zh-Hant']?.[0]||item.title||title).slice(0,120)});
 }
 return sources;
}
async function gamerVideoMatch(candidate:IndexedMatch):Promise<DanmakuMatch>{
 if(!candidate.gamerAcgId)return {provider:'gamer',key:candidate.key,title:candidate.title};
 // bangumi-data's Gamer `id` identifies acgDetail.php, NOT animeVideo.php.
 // Search only to join that exact acg_sn to a real video_sn; no title-only guesses.
 const result=await remote('https://api.gamer.com.tw/mobile_app/anime/v1/search.php?'+new URLSearchParams({kw:candidate.gamerSearchTitle||candidate.title}));
 const items=gamerPayload(result,'search').anime;
 const videos=items.filter((item:any)=>String(item?.acg_sn)===candidate.gamerAcgId&&id(String(item?.video_sn)));
 const found=videos.find((item:any)=>!/中配|中文配音|國語|国语|粵語|粤语/.test(String(item.title||'')))||videos[0];
 if(!found)throw new DanmakuError('Gamer 搜索未返回与番剧资料编号一致的视频入口，未使用同名条目替代',502,'UPSTREAM_MAPPING');
 return {provider:'gamer',key:String(found.video_sn),title:candidate.title};
}
async function mapping(subjectId:string){
 const subject=await remote('https://api.bgm.tv/v0/subjects/'+subjectId);
 const date=String(subject?.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number(date.slice(0,4))<1900||Number(date.slice(0,4))>2100)return [];
 // Match by Bangumi ID, never by a guessed title/season. Small monthly files only.
 const base=new Date(date.slice(0,7)+'-15T12:00:00Z');
 for(const delta of [0,-1,1]){const month=new Date(base);month.setUTCMonth(month.getUTCMonth()+delta);const path=month.toISOString().slice(0,7).replace('-','/');
  let items;try{items=await remote('https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/data/items/'+path+'.json');}catch(error){if(delta===0)throw error;continue;}
  const found=mappedProviders(items,subjectId);if(found.length)return found;
 }return [];
}
async function match(subjectId:string){
 const notices:DanmakuNotice[]=[],sources:DanmakuMatch[]=[];
 const results=await Promise.allSettled([mapping(subjectId),credentials()?dandanRequest('/api/v2/bangumi/bgmtv/'+subjectId):Promise.resolve(null)]);
 const mapped=results[0];let partial=false;
 if(mapped.status==='fulfilled')for(const candidate of mapped.value){
  if(candidate.provider!=='gamer'){sources.push(candidate);continue;}
  try{sources.push(await gamerVideoMatch(candidate));}catch(error){partial=true;notices.push({provider:'gamer',message:error instanceof DanmakuError?error.message:'Gamer 视频编号转换暂不可用，请稍后重试',configured:true});}
 }else notices.push({provider:'bilibili',message:'番剧弹幕索引暂不可用，可粘贴来源链接匹配',configured:true});
 const dandan=results[1];if(dandan.status==='fulfilled'&&dandan.value?.bangumi&&id(String(dandan.value.bangumi.animeId)))sources.push({provider:'dandan',key:String(dandan.value.bangumi.animeId),title:String(dandan.value.bangumi.animeTitle||'弹弹play 匹配').slice(0,180)});
 else notices.push({provider:'dandan',message:!credentials()?'需站长配置应用密钥':dandan.status==='rejected'?dandan.reason instanceof DanmakuError?dandan.reason.message:'弹弹play 暂不可用':'弹弹play 没有匹配的番剧',configured:!!credentials()});
 if(!sources.length&&notices.every(n=>n.provider!=='bilibili'))notices.push({provider:'bilibili',message:'索引中暂无该番剧，请粘贴 BiliBili 番剧链接匹配',configured:true});
 return {sources,notices,...(partial||mapped.status==='rejected'||dandan.status==='rejected'?{offline:true}:{})};
}
function biliCheck(data:any){if(data?.code!==0)throw new DanmakuError('BiliBili 番剧暂不可用'+(data?.code?'（'+data.code+'）':''),502,[-412,-352].includes(data?.code)?'UPSTREAM_BLOCKED':'UPSTREAM_ERROR');return data.result;}
async function biliEpisodes(key:string){
 let seasonKey=key;
 if(key.startsWith('md')){const media=biliCheck(await remote('https://api.bilibili.com/pgc/review/user?media_id='+key.slice(2)))?.media;if(!id(String(media?.season_id)))throw new DanmakuError('该 BiliBili 番剧没有可用分集');seasonKey='ss'+media.season_id;}
 const result=biliCheck(await remote('https://api.bilibili.com/pgc/view/web/season?'+(seasonKey.startsWith('ep')?'ep_id=':'season_id=')+seasonKey.slice(2)));
 if(!Array.isArray(result?.episodes))throw new DanmakuError('BiliBili 分集格式不正确');
 const episodes:DanmakuEpisode[]=result.episodes.slice(0,1000).flatMap((ep:any)=>!id(String(ep.cid))?[]:[{id:String(ep.cid),...(/^\d+(?:\.\d+)?$/.test(String(ep.title))?{number:Number(ep.title)}:{}),title:(String(ep.title)+' '+String(ep.long_title||'')).trim().slice(0,180)}]);
 return {title:String(result.title||'BiliBili').slice(0,180),episodes};
}
function gamerPayload(result:any,operation:'episodes'|'comments'|'search'){
 // Some releases wrap the payload once more. Validate the expected content;
 // do not mistake an HTTP-200 error object for a successful empty catalogue.
 for(const value of [result?.data,result?.data?.data,result])if(value&&typeof value==='object'&&(operation==='episodes'?value.anime&&typeof value.anime==='object':operation==='search'?Array.isArray(value.anime):Array.isArray(value.danmu)))return value;
 const error=result?.error||result?.errors,code=result?.errorCode??error?.code??result?.code;
 const raw=typeof error==='string'?error:typeof error?.message==='string'?error.message:result?.errorMessage||result?.message||result?.msg;
 const message=typeof raw==='string'?raw.replace(/[\u0000-\u001f]/g,' ').slice(0,180):'';
 const reason=/系[统統][维維][护護修]|维护|維護|maintenance/i.test(message)?'UPSTREAM_MAINTENANCE':/地区|地區|region|country/i.test(message)?'UPSTREAM_REGION':/login|登入|登录|unauthor|認證|认证|验证|驗證/i.test(message)?'UPSTREAM_AUTH':/無此|无此|授[权權].*到期|not found/i.test(message)?'UPSTREAM_UNAVAILABLE':'UPSTREAM_FORMAT';
 const codeText=typeof code==='number'||typeof code==='string'&&/^-?[\da-z_]{1,24}$/i.test(code)?String(code):'';
 // These anonymous Gamer requests send only public IDs, never site/user credentials.
 // Keep a bounded plain-text reason, not the response body or comment author data.
 const hint=message.replace(/<[^>]*>/g,'').slice(0,180);
 console.warn('danmaku-provider-response',{provider:'gamer',operation,code:codeText,reason,message:hint,fields:result&&typeof result==='object'?Object.keys(result).slice(0,12):[],dataFields:result?.data&&typeof result.data==='object'?Object.keys(result.data).slice(0,12):[]});
 const failure=new DanmakuError('Gamer '+(reason==='UPSTREAM_MAINTENANCE'?'服务正在维护':reason==='UPSTREAM_REGION'?'当前地区不可用':reason==='UPSTREAM_AUTH'?'要求来源站认证':reason==='UPSTREAM_UNAVAILABLE'?'当前番剧或分集不可用':'接口未返回有效'+(operation==='episodes'?'分集目录':operation==='search'?'搜索结果':'弹幕数据'))+(codeText?'（'+codeText+'）':'')+(hint?'：'+hint:''),502,reason,200,reason==='UPSTREAM_MAINTENANCE'?60:0);pauseOrigin('api.gamer.com.tw',failure);throw failure;
}
async function gamerEpisodes(key:string){
 const result=await remote('https://api.gamer.com.tw/anime/v1/video.php?videoSn='+key),anime=gamerPayload(result,'episodes').anime;
 if(!anime.episodes||typeof anime.episodes!=='object')throw new DanmakuError('Gamer 当前番剧没有分集目录',502,'UPSTREAM_FORMAT');
 const groups=anime.episodes,available=Object.values(groups).filter(Array.isArray),main=Array.isArray(groups['0'])?groups['0']:Array.isArray(groups['1'])?groups['1']:available.length===1?available[0]:[];
 const episodes:DanmakuEpisode[]=main.slice(0,1000).flatMap((ep:any)=>!id(String(ep.videoSn))?[]:[{id:String(ep.videoSn),...(/^\d+(?:\.\d+)?$/.test(String(ep.episode))?{number:Number(ep.episode)}:{}),title:'第 '+String(ep.episode).slice(0,40)+' 集'}]);
 return {title:String(anime.title||'Gamer').slice(0,180),episodes};
}
async function dandanEpisodes(key:string){
 const data=await dandanRequest('/api/v2/bangumi/'+key),bangumi=data?.bangumi;
 if(!Array.isArray(bangumi?.episodes))throw new DanmakuError('弹弹play 没有返回分集');
 const episodes:DanmakuEpisode[]=bangumi.episodes.slice(0,1000).flatMap((ep:any)=>{if(!id(String(ep.episodeId)))return [];const title=String(ep.episodeTitle||'').slice(0,180),match=title.match(/^(?:第\s*)?(\d+(?:\.\d+)?)(?:\s*[话話集]|\s|$)/);return [{id:String(ep.episodeId),...(match?{number:Number(match[1])}:{}),title:title||'未命名分集'}];});
 return {title:String(bangumi.animeTitle||'弹弹play').slice(0,180),episodes};
}
const searchTitle=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]{0,500}>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,key=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[key]||key)).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,180):'';
async function searchDanmaku(provider:string,keyword:string,subjectId:string){
 let sources:DanmakuMatch[]=[],hasMore=false,notice='';
 if(provider==='index'){
  const subject=await remote('https://api.bgm.tv/v0/subjects/'+subjectId),date=String(subject?.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new DanmakuError('番剧未收录首播日期，请切换其他检索来源',400);
  const base=new Date(date.slice(0,7)+'-15T12:00:00Z'),term=keyword.toLocaleLowerCase().replace(/\s+/g,'');
  const months=await Promise.allSettled([0,-1,1].map(async delta=>{const month=new Date(base);month.setUTCMonth(month.getUTCMonth()+delta);const items=await remote('https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/data/items/'+month.toISOString().slice(0,7).replace('-','/')+'.json');if(!Array.isArray(items))throw new DanmakuError('番剧索引格式不正确');return items;}));
  if(months.every(result=>result.status==='rejected'))throw (months[0] as PromiseRejectedResult).reason;
  notice=months.some(result=>result.status==='rejected')?'部分月份索引暂不可用':'';
  for(const result of months)if(result.status==='fulfilled')for(const item of result.value.slice(0,3000)){
   const names=[item.title,...Object.values(item.titleTranslate||{}).flat()].filter((name):name is string=>typeof name==='string');if(!names.some(name=>name.toLocaleLowerCase().replace(/\s+/g,'').includes(term)))continue;
   const title=searchTitle(item.titleTranslate?.['zh-Hans']?.[0]||item.title);
   for(const site of Array.isArray(item.sites)?item.sites:[]){if(!id(String(site.id)))continue;if(site.site==='bilibili')sources.push({provider:'bilibili',key:'md'+site.id,title});else if(site.site==='gamer'&&id(String(site.video_sn)))sources.push({provider:'gamer',key:String(site.video_sn),title});}
  }
 }else if(provider==='bilibili'){
  const data=await remote('https://api.bilibili.com/x/web-interface/search/type?'+new URLSearchParams({search_type:'media_bangumi',keyword,page:'1'}));
  if(data?.code!==0)throw new DanmakuError('BiliBili 检索暂不可用'+(data?.code?'（'+data.code+'）':''),502,'UPSTREAM_ERROR');
  if(!Array.isArray(data.data?.result))throw new DanmakuError('BiliBili 检索数据格式不正确',502,'UPSTREAM_FORMAT');
  sources=data.data.result.slice(0,60).flatMap((item:any)=>id(String(item.season_id))?[{provider:'bilibili' as const,key:'ss'+item.season_id,title:searchTitle(item.title)}]:[]);hasMore=Number(data.data.numPages)>1;
 }else if(provider==='gamer'){
  const data=gamerPayload(await remote('https://api.gamer.com.tw/mobile_app/anime/v1/search.php?'+new URLSearchParams({kw:keyword})),'search');
  sources=data.anime.slice(0,60).flatMap((item:any)=>id(String(item.video_sn))?[{provider:'gamer' as const,key:String(item.video_sn),title:searchTitle(item.title)}]:[]);
 }else{
  // Same v2 search used upstream: fetch the full episode catalogue only after selection.
  const data=await dandanRequest('/api/v2/search/episodes','?'+new URLSearchParams({anime:keyword,v2:'true'}));
  if(!Array.isArray(data?.animes))throw new DanmakuError('弹弹play 检索数据格式不正确',502,'UPSTREAM_FORMAT');
  sources=data.animes.slice(0,60).flatMap((item:any)=>id(String(item.animeId))?[{provider:'dandan' as const,key:String(item.animeId),title:searchTitle(item.animeTitle)}]:[]);hasMore=data.hasMore===true;
 }
 const unique=[...new Map(sources.filter(source=>source.title).map(source=>[source.provider+':'+source.key,source])).values()];
 return {sources:unique.slice(0,40),hasMore:hasMore||unique.length>40,...(notice?{notice}:{})};
}
export async function danmakuResponse(params:URLSearchParams){
 try{
  const op=params.get('op')||'match',provider=params.get('provider') as DanmakuProvider,key=params.get('key')||'';
  if(op==='search'){
   const searchProvider=params.get('provider')||'',keyword=(params.get('keyword')||'').normalize('NFC').trim(),subjectId=params.get('id')||'';
   if(!['index','bilibili','gamer','dandan'].includes(searchProvider)||!keyword||keyword.length>100||/[\u0000-\u001f\u007f]/.test(keyword)||searchProvider==='index'&&!id(subjectId))throw new DanmakuError('请输入 1 至 100 字的番剧名称并选择有效来源',400);
   if(searchProvider==='dandan'&&!credentials())throw new DanmakuError('弹弹play 需站长申请并配置本站应用凭证；可切换季度索引、BiliBili 或 Gamer',503,'DANDAN_NOT_CONFIGURED');
   return await cachedJson('danmaku-search','v1:'+searchProvider+':'+(searchProvider==='index'?subjectId+':':'')+keyword,()=>searchDanmaku(searchProvider,keyword,subjectId),{ttl:600000,stale:3600000,timeout:30000,background:true});
  }
  if(op==='match'){
   const subjectId=params.get('id')||'';if(!id(subjectId))throw new DanmakuError('请选择有效番剧；测试视频可手动匹配弹幕',400);
   return await cachedJson('danmaku-match','v3:'+subjectId+':'+!!credentials(),()=>match(subjectId),{ttl:86400000,stale:7*86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  if(!['bilibili','gamer','dandan'].includes(provider))throw new DanmakuError('无效弹幕来源',400);
  if(provider==='dandan'&&!credentials())throw new DanmakuError('弹弹play 需站长申请并配置本站应用凭证',503,'DANDAN_NOT_CONFIGURED');
  if(op==='episodes'){
   // Explicit per-episode links are useful even when a public season directory is unavailable.
   // They never silently imply episode one or fetch a caller-supplied destination.
   if(provider==='bilibili'&&key.startsWith('cid')&&id(key.slice(3)))return Response.json({title:'手动指定的 BiliBili 弹幕',direct:true,episodes:[{id:key.slice(3),title:'指定弹幕文件 · 请核对分集'}]});
   if(provider==='gamer'&&key.startsWith('sn')&&id(key.slice(2)))return Response.json({title:'手动指定的 Gamer 分集',direct:true,episodes:[{id:key.slice(2),title:'当前链接 · 请核对分集'}]});
   if(provider==='bilibili'?!/^(md|ss|ep)[1-9]\d{0,14}$/.test(key)||!id(key.slice(2)):!id(key))throw new DanmakuError('无效的弹幕番剧标识',400);
   return await cachedJson('danmaku-episodes','v2:'+provider+':'+key,()=>provider==='bilibili'?biliEpisodes(key):provider==='gamer'?gamerEpisodes(key):dandanEpisodes(key),{ttl:21600000,stale:86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  if(op==='comments'){
   if(!id(key))throw new DanmakuError('无效的弹幕分集标识',400);
   return await cachedJson('danmaku-comments','v2:'+provider+':'+key,async()=>{
    const rows=provider==='bilibili'?parseBilibiliXml(await remote('https://comment.bilibili.com/'+key+'.xml',{},5*1024*1024,true)):
     // geo selects the public comment catalogue. It is not a client-location header;
     // region/authentication refusals are still reported and never bypassed.
     provider==='gamer'?parseGamerComments(gamerPayload(await remote('https://api.gamer.com.tw/anime/v1/danmu.php?'+new URLSearchParams({videoSn:key,geo:'TW,HK'}),{},5*1024*1024),'comments').danmu):
     parseDandanComments((await dandanRequest('/api/v2/comment/'+key,'?withRelated=true&chConvert=1'))?.comments);
    return {...limitDanmaku(rows),provider,episodeId:key};
   },{ttl:1800000,stale:86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  throw new DanmakuError('无效弹幕操作',400);
 }catch(error){const failure=error instanceof DanmakuError?error:new DanmakuError(error instanceof Error&&error.name==='TimeoutError'?'弹幕来源超时，请重试':'弹幕加载失败，请重试或更换来源',502,error instanceof Error&&error.name==='TimeoutError'?'UPSTREAM_TIMEOUT':'UPSTREAM_ERROR');return Response.json({error:failure.message,code:failure.code,...(failure.upstreamStatus?{upstreamStatus:failure.upstreamStatus}:{}),...(failure.retryAfter?{retryAfter:failure.retryAfter}:{})},{status:failure.status,headers:{'Cache-Control':'no-store',...(failure.retryAfter?{'Retry-After':String(failure.retryAfter)}:{})}});}
}
