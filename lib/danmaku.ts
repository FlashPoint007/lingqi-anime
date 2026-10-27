export type DanmakuProvider='bilibili'|'gamer'|'dandan';
export type DanmakuSource=DanmakuProvider|'local'|'site';
// Seconds, mode (scroll/bottom/top), RGB, plain text, origin. No user identifiers.
export type DanmakuComment=[number,1|4|5,number,string,DanmakuSource];
export type DanmakuEpisode={id:string;number?:number;title:string};
export type DanmakuMatch={provider:DanmakuProvider;key:string;title:string};
export type DanmakuNotice={provider:DanmakuProvider;message:string;configured:boolean};
export type DanmakuSettings={enabled:boolean;pauseOnEdit:boolean;conversion:'none'|'simplified'|'traditional';opacity:number;fontSize:number;offset:number;area:number;speed:number;keywords:string;regexPatterns:string;maxLength:number;blockRepetition:boolean;sources:Record<DanmakuSource,boolean>;modes:Record<'scroll'|'top'|'bottom',boolean>;color:boolean;deduplicate:boolean};
export const danmakuNames:Record<DanmakuSource,string>={bilibili:'BiliBili',gamer:'Gamer 巴哈姆特',dandan:'弹弹play',local:'本地文件',site:'本站弹幕'};
export const defaultDanmakuSettings:DanmakuSettings={enabled:true,pauseOnEdit:true,conversion:'none',opacity:.85,fontSize:22,offset:0,area:.5,speed:1,keywords:'',regexPatterns:'',maxLength:180,blockRepetition:false,modes:{scroll:true,top:true,bottom:true},color:true,deduplicate:true,sources:{bilibili:true,gamer:true,dandan:true,local:true,site:true}};
export function danmakuSettings(value:unknown):DanmakuSettings{
 const v=value&&typeof value==='object'?value as Partial<DanmakuSettings>:{};
 const clamp=(n:unknown,lo:number,hi:number,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):fallback;
 return {conversion:v.conversion==='simplified'||v.conversion==='traditional'?v.conversion:'none',pauseOnEdit:v.pauseOnEdit!==false,regexPatterns:typeof v.regexPatterns==='string'?v.regexPatterns.slice(0,4096):'',maxLength:Math.round(clamp(v.maxLength,5,180,180)),blockRepetition:v.blockRepetition===true,modes:{scroll:v.modes?.scroll!==false,top:v.modes?.top!==false,bottom:v.modes?.bottom!==false},color:v.color!==false,deduplicate:v.deduplicate!==false,enabled:typeof v.enabled==='boolean'?v.enabled:true,opacity:clamp(v.opacity,.2,1,.85),fontSize:clamp(v.fontSize,16,36,22),offset:clamp(v.offset,-300,300,0),area:clamp(v.area,.25,1,.5),speed:clamp(v.speed,.5,2,1),keywords:typeof v.keywords==='string'?v.keywords.slice(0,2000):'',sources:{bilibili:v.sources?.bilibili!==false,gamer:v.sources?.gamer!==false,dandan:v.sources?.dandan!==false,local:v.sources?.local!==false,site:v.sources?.site!==false}};
}
function plain(value:unknown){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,180):'';}
function comment(time:unknown,mode:unknown,color:unknown,text:unknown,source:DanmakuSource):DanmakuComment|null{
 const t=Number(time),m=Number(mode),c=Number(color),s=plain(text);
 if(!Number.isFinite(t)||t<0||t>86400||![1,4,5].includes(m)||!s)return null;
 return [Math.round(t*1000)/1000,m as 1|4|5,Number.isSafeInteger(c)&&c>=0&&c<=0xffffff?c:0xffffff,s,source];
}
function decodeXml(text:string){return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(whole,key:string)=>{
 if(key[0]==='#'){const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';}
 return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[key]??whole;
 });}
export function parseBilibiliXml(text:string,source:DanmakuSource='bilibili'){
 if(text.length>5*1024*1024)throw new Error('弹幕文件超过 5 MB');
 if(/<!DOCTYPE|<!ENTITY/i.test(text)||!/<i(?:\s[^>]*)?>[\s\S]*<\/i>\s*$/.test(text))throw new Error('不是有效的 BiliBili XML 弹幕');
 const result:DanmakuComment[]=[];const re=/<d\s+p=["']([^"']{1,300})["'][^>]*>([^<]*)<\/d>/g;let match:RegExpExecArray|null;
 while((match=re.exec(text))){const p=match[1].split(','),row=comment(p[0],p[1],p[3],decodeXml(match[2]),source);if(row)result.push(row);if(result.length>=50000)break;}
 return result;
}
export function parseDandanComments(value:unknown,local=false){
 if(!Array.isArray(value))throw new Error('弹幕数据格式不正确');
 const result:DanmakuComment[]=[];
 for(const item of value.slice(0,50000)){
  if(!item||typeof item.p!=='string')continue;const p=item.p.split(',');
  const source:DanmakuSource=local?'local':/bilibili/i.test(p[3]||'')?'bilibili':/gamer|bahamut/i.test(p[3]||'')?'gamer':'dandan';
  const row=comment(p[0],p[1],p[2],item.m,source);if(row)result.push(row);
 }
 return result;
}
export function parseGamerComments(value:unknown){
 if(!Array.isArray(value))throw new Error('Gamer 弹幕数据格式不正确');
 return value.slice(0,50000).flatMap(item=>{if(!item||![0,1,2].includes(Number(item.position)))return [];const row=comment(Number(item.time)/10,[1,5,4][Number(item.position)],parseInt(String(item.color).replace(/^#/,''),16),item.text,'gamer');return row?[row]:[];});
}
export function importDanmaku(text:string){
 if(new TextEncoder().encode(text).length>5*1024*1024)throw new Error('请选择不超过 5 MB 的弹幕文件');
 if(text.trimStart().startsWith('<'))return limitDanmaku(parseBilibiliXml(text,'local'));
 let data;try{data=JSON.parse(text);}catch{throw new Error('请选择 BiliBili XML 或弹弹play JSON 弹幕');}
 return limitDanmaku(parseDandanComments(Array.isArray(data)?data:data?.comments,true));
}
export function danmakuXml(comments:DanmakuComment[],offset=0){
 const escape=(text:string)=>text.replace(/[&<>"']/g,key=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[key]!));
 return '<?xml version="1.0" encoding="UTF-8"?>\n<i>\n'+comments.filter(row=>Number.isFinite(row[0]+offset)&&row[0]+offset>=0&&row[0]+offset<=86400).map(row=>'<d p="'+[Math.round((row[0]+offset)*1000)/1000,row[1],25,row[2],0,0,0,0].join(',')+'">'+escape(row[3])+'</d>').join('\n')+'\n</i>\n';
}
export function limitDanmaku(input:DanmakuComment[]){
 const sorted=input.slice().sort((a,b)=>a[0]-b[0]),seen=new Set<string>();
 const unique=sorted.filter(row=>{const key=Math.round(row[0]*2)+':'+row[1]+':'+row[3];if(seen.has(key))return false;seen.add(key);return true;});
 // Sample across the complete episode, preserving late comments and the D1 size ceiling.
 let count=Math.min(2400,unique.length),rows:DanmakuComment[]=[];
 do{rows=count>=unique.length?unique: Array.from({length:count},(_,i)=>unique[Math.floor(i*(unique.length-1)/Math.max(1,count-1))]);if(new TextEncoder().encode(JSON.stringify(rows)).length<=170000)break;count=Math.floor(count*.8);}while(count>0);
 return {comments:rows,total:input.length,sampled:rows.length<unique.length};
}
export function filteredDanmaku(comments:DanmakuComment[],settings:DanmakuSettings){
 const words=settings.keywords.toLocaleLowerCase().split(/[\n,，]/).map(s=>s.trim()).filter(Boolean).slice(0,100);
 const seen=new Map<string,number>();
 return comments.filter(row=>{
  if(!settings.sources[row[4]]||settings.modes?.[row[1]===1?'scroll':row[1]===4?'bottom':'top']===false||words.some(word=>row[3].toLocaleLowerCase().includes(word)))return false;
  if(settings.deduplicate){const key=row[1]+':'+row[3].toLocaleLowerCase().replace(/\s+/g,''),last=seen.get(key);if(last!==undefined&&row[0]-last<10)return false;seen.set(key,row[0]);}
  return true;
 }).map(row=>settings.color===false?[row[0],row[1],0xffffff,row[3],row[4]] as DanmakuComment:row);
}
export function exactDanmakuEpisode(episodes:DanmakuEpisode[],number:number|undefined){
 if(number===undefined||!Number.isFinite(number))return undefined;
 const matches=episodes.filter(ep=>ep.number===number);return matches.length===1?matches[0]:undefined;
}
export function parseDanmakuLink(raw:string):{provider:DanmakuProvider;key:string}|null{
 const value=raw.trim();if(/^(?:md|ss|ep|cid)[1-9]\d{0,14}$/i.test(value))return {provider:'bilibili',key:value.toLowerCase()};
 if(/^gamer:[1-9]\d{0,14}$/.test(value))return {provider:'gamer',key:'sn'+value.slice(6)};
 if(/^dandan:[1-9]\d{0,14}$/.test(value))return {provider:'dandan',key:value.slice(7)};
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 if(['www.bilibili.com','bilibili.com'].includes(u.hostname)){const match=u.pathname.match(/^\/bangumi\/(?:play|media)\/((?:md|ss|ep)[1-9]\d{0,14})\/?$/i);if(match)return {provider:'bilibili',key:match[1].toLowerCase()};}
 if(u.hostname==='comment.bilibili.com'){const match=u.pathname.match(/^\/([1-9]\d{0,14})\.xml$/);if(match)return {provider:'bilibili',key:'cid'+match[1]};}
 if(u.hostname==='ani.gamer.com.tw'&&/^\/animeVideo.php$/.test(u.pathname)&&/^[1-9]\d{0,14}$/.test(u.searchParams.get('sn')||''))return {provider:'gamer',key:'sn'+u.searchParams.get('sn')!};
 }catch{}return null;
}
