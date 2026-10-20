import {boundedText} from './playback-server';
import {cachedJson} from './server-cache';
import {parseBilibiliXml,parseDandanComments,parseGamerComments,limitDanmaku,type DanmakuEpisode,type DanmakuProvider,type DanmakuMatch,type DanmakuNotice} from './danmaku';
const UA='LingqiWeb/1.0 (+https://github.com/FlashPoint007/lingqi-anime)';
class DanmakuError extends Error{constructor(message:string,public status=502){super(message);}}
const id=(s:string)=>/^[1-9]\d{0,14}$/.test(s)&&Number.isSafeInteger(Number(s));
function credentials(){const appId=process.env.LINGQI_DANDAN_APP_ID,secret=process.env.LINGQI_DANDAN_APP_SECRET;return appId&&secret?{appId,secret}:null;}
async function remote(url:string,headers:Record<string,string>={},max=2*1024*1024,xml=false){
 const response=await fetch(url,{headers:{'User-Agent':UA,Accept:xml?'text/xml':'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok){void response.body?.cancel().catch(()=>{});throw new DanmakuError('弹幕来源响应 '+response.status+'，'+(response.status===412?'该来源限制服务器访问，可导入弹幕或使用已配置的弹弹play':'请稍后重试或更换来源'));}
 const text=await boundedText(response,max,10000);
 if(xml)return text;
 try{return JSON.parse(text);}catch{throw new DanmakuError('弹幕来源没有返回有效数据');}
}
export async function dandanRequest(path:string,query=''){
 const auth=credentials();if(!auth)throw new DanmakuError('弹弹play 尚未配置应用密钥；可使用 BiliBili 或导入弹幕',503);
 const timestamp=String(Math.floor(Date.now()/1000)),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.appId+timestamp+path+auth.secret));
 const signature=btoa(String.fromCharCode(...new Uint8Array(bytes)));
 const data=await remote('https://api.dandanplay.net'+path+query,{'X-AppId':auth.appId,'X-Timestamp':timestamp,'X-Signature':signature});
 if(data?.success===false)throw new DanmakuError('弹弹play 请求失败，请检查服务端授权或稍后重试');return data;
}
function mappedProviders(items:unknown,subjectId:string):DanmakuMatch[]{
 if(!Array.isArray(items))throw new DanmakuError('番剧弹幕索引格式不正确');
 const item=items.find(i=>Array.isArray(i?.sites)&&i.sites.some((s:any)=>s.site==='bangumi'&&s.id===subjectId));if(!item)return [];
 const sources:DanmakuMatch[]=[];
 for(const site of item.sites){if(!id(String(site.id)))continue;const provider=site.site==='bilibili'?'bilibili':site.site==='gamer'?'gamer':null;if(provider&&!sources.some(s=>s.provider===provider))sources.push({provider,key:provider==='bilibili'?'md'+site.id:String(site.id),title:String(item.titleTranslate?.['zh-Hans']?.[0]||item.title||'已匹配番剧').slice(0,180)});}
 return sources;
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
 const mapped=results[0];if(mapped.status==='fulfilled')sources.push(...mapped.value);else notices.push({provider:'bilibili',message:'番剧弹幕索引暂不可用，可粘贴来源链接匹配',configured:true});
 const dandan=results[1];if(dandan.status==='fulfilled'&&dandan.value?.bangumi&&id(String(dandan.value.bangumi.animeId)))sources.push({provider:'dandan',key:String(dandan.value.bangumi.animeId),title:String(dandan.value.bangumi.animeTitle||'弹弹play 匹配').slice(0,180)});
 else notices.push({provider:'dandan',message:!credentials()?'需站长配置应用密钥':dandan.status==='rejected'?'弹弹play 暂不可用':'弹弹play 没有匹配的番剧',configured:!!credentials()});
 if(!sources.length&&notices.every(n=>n.provider!=='bilibili'))notices.push({provider:'bilibili',message:'索引中暂无该番剧，请粘贴 BiliBili 番剧链接匹配',configured:true});
 return {sources,notices,...(mapped.status==='rejected'||dandan.status==='rejected'?{offline:true}:{})};
}
function biliCheck(data:any){if(data?.code!==0)throw new DanmakuError('BiliBili 番剧暂不可用'+(data?.code?'（'+data.code+'）':''));return data.result;}
async function biliEpisodes(key:string){
 let seasonKey=key;
 if(key.startsWith('md')){const media=biliCheck(await remote('https://api.bilibili.com/pgc/review/user?media_id='+key.slice(2)))?.media;if(!id(String(media?.season_id)))throw new DanmakuError('该 BiliBili 番剧没有可用分集');seasonKey='ss'+media.season_id;}
 const result=biliCheck(await remote('https://api.bilibili.com/pgc/view/web/season?'+(seasonKey.startsWith('ep')?'ep_id=':'season_id=')+seasonKey.slice(2)));
 if(!Array.isArray(result?.episodes))throw new DanmakuError('BiliBili 分集格式不正确');
 const episodes:DanmakuEpisode[]=result.episodes.slice(0,1000).flatMap((ep:any)=>!id(String(ep.cid))?[]:[{id:String(ep.cid),...(/^\d+(?:\.\d+)?$/.test(String(ep.title))?{number:Number(ep.title)}:{}),title:(String(ep.title)+' '+String(ep.long_title||'')).trim().slice(0,180)}]);
 return {title:String(result.title||'BiliBili').slice(0,180),episodes};
}
async function gamerEpisodes(key:string){
 const result=await remote('https://api.gamer.com.tw/anime/v1/video.php?videoSn='+key),anime=result?.data?.anime;
 if(!anime||typeof anime.episodes!=='object')throw new DanmakuError('Gamer 没有返回分集'+(typeof result?.error?.message==='string'?'（'+result.error.message.slice(0,100)+'）':'；请手动指定当前分集链接或导入弹幕'));
 const groups=anime.episodes,main=Array.isArray(groups['0'])?groups['0']:Array.isArray(groups['1'])?groups['1']:[];
 const episodes:DanmakuEpisode[]=main.slice(0,1000).flatMap((ep:any)=>!id(String(ep.videoSn))?[]:[{id:String(ep.videoSn),...(/^\d+(?:\.\d+)?$/.test(String(ep.episode))?{number:Number(ep.episode)}:{}),title:'第 '+String(ep.episode).slice(0,40)+' 集'}]);
 return {title:String(anime.title||'Gamer').slice(0,180),episodes};
}
async function dandanEpisodes(key:string){
 const data=await dandanRequest('/api/v2/bangumi/'+key),bangumi=data?.bangumi;
 if(!Array.isArray(bangumi?.episodes))throw new DanmakuError('弹弹play 没有返回分集');
 const episodes:DanmakuEpisode[]=bangumi.episodes.slice(0,1000).flatMap((ep:any)=>{if(!id(String(ep.episodeId)))return [];const title=String(ep.episodeTitle||'').slice(0,180),match=title.match(/^(?:第\s*)?(\d+(?:\.\d+)?)(?:\s*[话話集]|\s|$)/);return [{id:String(ep.episodeId),...(match?{number:Number(match[1])}:{}),title:title||'未命名分集'}];});
 return {title:String(bangumi.animeTitle||'弹弹play').slice(0,180),episodes};
}
export async function danmakuResponse(params:URLSearchParams){
 try{
  const op=params.get('op')||'match',provider=params.get('provider') as DanmakuProvider,key=params.get('key')||'';
  if(op==='match'){
   const subjectId=params.get('id')||'';if(!id(subjectId))throw new DanmakuError('请选择有效番剧；测试视频可手动匹配弹幕',400);
   return await cachedJson('danmaku-match','v1:'+subjectId+':'+!!credentials(),()=>match(subjectId),{ttl:86400000,stale:7*86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  if(!['bilibili','gamer','dandan'].includes(provider))throw new DanmakuError('无效弹幕来源',400);
  if(provider==='dandan'&&!credentials())throw new DanmakuError('弹弹play 需站长配置应用密钥',503);
  if(op==='episodes'){
   // Explicit per-episode links are useful even when a public season directory is unavailable.
   // They never silently imply episode one or fetch a caller-supplied destination.
   if(provider==='bilibili'&&key.startsWith('cid')&&id(key.slice(3)))return Response.json({title:'手动指定的 BiliBili 弹幕',direct:true,episodes:[{id:key.slice(3),title:'指定弹幕文件 · 请核对分集'}]});
   if(provider==='gamer'&&key.startsWith('sn')&&id(key.slice(2)))return Response.json({title:'手动指定的 Gamer 分集',direct:true,episodes:[{id:key.slice(2),title:'当前链接 · 请核对分集'}]});
   if(provider==='bilibili'?!/^(md|ss|ep)[1-9]\d{0,14}$/.test(key)||!id(key.slice(2)):!id(key))throw new DanmakuError('无效的弹幕番剧标识',400);
   return await cachedJson('danmaku-episodes','v1:'+provider+':'+key,()=>provider==='bilibili'?biliEpisodes(key):provider==='gamer'?gamerEpisodes(key):dandanEpisodes(key),{ttl:21600000,stale:86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  if(op==='comments'){
   if(!id(key))throw new DanmakuError('无效的弹幕分集标识',400);
   return await cachedJson('danmaku-comments','v1:'+provider+':'+key,async()=>{
    const rows=provider==='bilibili'?parseBilibiliXml(await remote('https://comment.bilibili.com/'+key+'.xml',{},5*1024*1024,true)):
     provider==='gamer'?parseGamerComments((await remote('https://api.gamer.com.tw/anime/v1/danmu.php?videoSn='+key,{},5*1024*1024))?.data?.danmu):
     parseDandanComments((await dandanRequest('/api/v2/comment/'+key,'?withRelated=true&chConvert=1'))?.comments);
    return {...limitDanmaku(rows),provider,episodeId:key};
   },{ttl:1800000,stale:86400000,background:true,refresh:params.get('refresh')==='1'});
  }
  throw new DanmakuError('无效弹幕操作',400);
 }catch(error){return Response.json({error:error instanceof DanmakuError?error.message:error instanceof Error&&error.name==='TimeoutError'?'弹幕来源超时，请重试':'弹幕加载失败，请重试或更换来源'},{status:error instanceof DanmakuError?error.status:502,headers:{'Cache-Control':'no-store'}});}
}
