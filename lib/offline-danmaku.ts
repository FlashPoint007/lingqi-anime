import {danmakuNames,exactDanmakuEpisode,limitDanmaku,type DanmakuComment,type DanmakuMatch,type DanmakuSettings} from './danmaku';
import {requestJson,anySignal,timeoutSignal,throwIfAborted} from './request-client';

export type OfflineDanmaku={version:1;status:'saved'|'empty'|'unavailable';comments:DanmakuComment[];total:number;sampled:boolean;source:string;notes:string[];savedAt:number;style:{opacity:number;fontSize:number;area:number;speed:number}};
type Selection={comments:DanmakuComment[];total:number;sampled:boolean;source:string;style:OfflineDanmaku['style'];siteEnabled:boolean;at:number};
const selections=new Map<string,Selection>();
const key=(owner:string,subject:number,number:number)=>owner+':'+subject+':'+number;
const validEpisode=(subject:number,number:number|undefined):number is number=>Number.isSafeInteger(subject)&&subject>0&&typeof number==='number'&&Number.isFinite(number)&&number>=0&&number<=10000;
// Only the current episode's selected, displayed remote/local comments are remembered.
// This bounded memory is not search/watch history and is never shared across accounts.
export function rememberOfflineDanmaku(owner:string,subject:number,number:number|undefined,comments:DanmakuComment[],total:number,sampled:boolean,source:string,settings:DanmakuSettings){
 if(!validEpisode(subject,number)||!comments.length&&total<=0)return;
 const id=key(owner,subject,number),bounded=limitDanmaku(comments.filter(row=>row[4]!=='site'&&row[0]+settings.offset>=0&&row[0]+settings.offset<=86400).map(row=>[row[0]+settings.offset,...row.slice(1)] as DanmakuComment));
 selections.delete(id);selections.set(id,{...bounded,total:Math.max(total,bounded.total),sampled:sampled||bounded.sampled,source:source.slice(0,180),style:{opacity:settings.opacity,fontSize:settings.fontSize,area:settings.area,speed:settings.speed},siteEnabled:settings.sources.site,at:Date.now()});
 while(selections.size>12)selections.delete(selections.keys().next().value!);
}
export async function captureOfflineDanmaku(input:{owner:string;subject:{id:number};number?:number},signal:AbortSignal):Promise<OfflineDanmaku>{
 const blank:OfflineDanmaku={version:1,status:'unavailable',comments:[],total:0,sampled:false,source:'',notes:[],savedAt:Date.now(),style:{opacity:.85,fontSize:22,area:.5,speed:1}};
 if(!validEpisode(input.subject.id,input.number))return {...blank,notes:['没有明确的番剧及集数，可在离线放映室导入 XML / JSON 弹幕。']};
 const deadline=anySignal([signal,timeoutSignal(30000)]),request=(params:Record<string,string>)=>requestJson('/api/danmaku?'+new URLSearchParams(params),{signal:deadline});
 const selected=selections.get(key(input.owner,input.subject.id,input.number));
 const snapshot=selected&&Date.now()-selected.at<30*60000?selected:undefined;
 const external=async():Promise<Selection>=>{
  if(snapshot)return snapshot;
  const matches=await request({op:'match',id:String(input.subject.id)}),sources:DanmakuMatch[]=Array.isArray(matches.sources)?matches.sources:[],errors:string[]=[];let emptySources=0;
  const empty=():Selection=>({comments:[],total:0,sampled:false,source:'公开来源暂无弹幕',style:blank.style,siteEnabled:true,at:Date.now()});
  if(!sources.length&&!matches.offline)return empty();
  for(const match of [...sources].sort((a,b)=>(a.provider==='dandan'?-1:0)-(b.provider==='dandan'?-1:0)).slice(0,3)){
   throwIfAborted(deadline);
   try{
    const catalogue=await request({op:'episodes',provider:match.provider,key:match.key});
    const episode=exactDanmakuEpisode(Array.isArray(catalogue.episodes)?catalogue.episodes:[],input.number);
    if(!episode){errors.push(danmakuNames[match.provider]+' 未唯一匹配当前集数');continue;}
    const data=await request({op:'comments',provider:match.provider,key:episode.id});if(!Array.isArray(data.comments))throw Error('弹幕数据格式不正确');
    if(!data.comments.length){emptySources++;errors.push(danmakuNames[match.provider]+' 这一集暂无弹幕');continue;}
    return {comments:data.comments,total:data.total||data.comments.length,sampled:!!data.sampled,source:danmakuNames[match.provider]+' · '+episode.title,style:blank.style,siteEnabled:true,at:Date.now()};
   }catch(error){if(deadline.aborted)throw error;errors.push((error as Error).message);}
  }
  if(emptySources===sources.length&&sources.length)return empty();
  throw Error(errors[0]||matches.notices?.map((n:any)=>n.message).filter(Boolean).join('；')||'未匹配到公开弹幕，可在播放页手动匹配或导入');
 };
 const site=async()=>{
  if(snapshot?.siteEnabled===false)return {comments:[] as DanmakuComment[],total:0,sampled:false};
  const data=await requestJson('/api/site-danmaku?'+new URLSearchParams({subject:String(input.subject.id),episode:String(input.number),offline:'1'}),{signal:deadline,cache:'no-store'});
  if(!Array.isArray(data.comments))throw Error('本站弹幕数据格式不正确');return {comments:data.comments as DanmakuComment[],total:Number(data.total)||0,sampled:!!data.sampled};
 };
 const [remote,local]=await Promise.allSettled([external(),site()]);throwIfAborted(signal);
 const comments=[...(remote.status==='fulfilled'?remote.value.comments:[]),...(local.status==='fulfilled'?local.value.comments:[])],bounded=limitDanmaku(comments);
 const notes=[remote,local].flatMap(result=>result.status==='rejected'?[String(result.reason?.message||'弹幕暂不可用').slice(0,220)]:[]);
 return {...blank,...bounded,status:comments.length?'saved':notes.length?'unavailable':'empty',total:Math.max(bounded.total,(remote.status==='fulfilled'?remote.value.total:0)+(local.status==='fulfilled'?local.value.total:0)),sampled:bounded.sampled||remote.status==='fulfilled'&&remote.value.sampled||local.status==='fulfilled'&&local.value.sampled,source:remote.status==='fulfilled'?remote.value.source:comments.length?'本站弹幕':'',style:remote.status==='fulfilled'?remote.value.style:blank.style,notes};
}
