import type {DanmakuComment} from './danmaku';
export type DanmakuSession={owner:string;ready:boolean;emailAccount:boolean;refresh:()=>void;flush:()=>unknown};
export type SiteDanmakuPost={id:string;time:number;mode:1|4|5;color:number;body:string;createdAt:number;own:boolean};
export const SITE_DANMAKU_LIMIT=80;
export function siteDanmakuScope(subject:unknown,episode:unknown){
 const id=Number(subject),number=Number(episode);
 if(subject===null||subject===''||!Number.isSafeInteger(id)||id<1||id>9999999999)throw Error('番剧编号无效');
 if(episode===undefined||episode===null||episode===''||!Number.isFinite(number)||number<0||number>10000||!Number.isInteger(number*1000))throw Error('请选择有明确集数的剧集后发送弹幕');
 return {subjectId:id,episode:String(number)};
}
export function siteDanmakuDraft(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('弹幕数据格式不正确');
 const scope=siteDanmakuScope(value.subjectId,value.episode);
 if(typeof value.body!=='string')throw Error('请输入弹幕内容');
 const body=value.body.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,' ').trim();
 if(!body||Array.from(body).length>SITE_DANMAKU_LIMIT)throw Error('弹幕请输入 1 至 80 个字符');
 if(typeof value.time!=='number'||!Number.isFinite(value.time)||value.time<0||value.time>86400)throw Error('弹幕时间应在 0 至 86400 秒之间');
 if(![1,4,5].includes(value.mode))throw Error('弹幕位置无效');
 if(!Number.isSafeInteger(value.color)||value.color<0||value.color>0xffffff)throw Error('弹幕颜色无效');
 return {...scope,body,time:Math.round(value.time*1000)/1000,mode:value.mode as 1|4|5,color:value.color as number};
}
export function parseSiteDanmakuPosts(value:unknown):SiteDanmakuPost[]{
 if(!Array.isArray(value)||value.length>500)throw Error('本站弹幕数据格式不正确');
 return value.map(row=>{
  if(!row||typeof row.id!=='string'||!/^[\da-f-]{36}$/i.test(row.id)||typeof row.body!=='string'||!row.body||Array.from(row.body).length>80||typeof row.time!=='number'||!Number.isFinite(row.time)||row.time<0||row.time>86400||![1,4,5].includes(row.mode)||!Number.isSafeInteger(row.color)||row.color<0||row.color>0xffffff||!Number.isSafeInteger(row.createdAt)||row.createdAt<0||typeof row.own!=='boolean')throw Error('本站弹幕数据格式不正确');
  return {id:row.id,time:row.time,mode:row.mode,color:row.color,body:row.body,createdAt:row.createdAt,own:row.own};
 });
}
export function siteDanmakuComments(posts:SiteDanmakuPost[],offset:number):DanmakuComment[]{
 // Upstream offset corrects remote timing; locally authored timestamps stay on
 // the actual video clock even when an upstream source needs an offset.
 return posts.map(row=>[row.time-offset,row.mode,row.color,row.body,'site']);
}
