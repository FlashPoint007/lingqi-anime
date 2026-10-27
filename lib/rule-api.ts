import {publicUrl,Rule} from './web-core';
export function selectJson(data:unknown,path:string):any[] {
 if(!path)return [];
 if(typeof path!=='string'||path[0]!=='$'||path.length>1000)throw new Error('不支持的 JSONPath：'+path);
 const token=/(?:\.([\w$-]+)|\[(\*|\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\])/y;
 let nodes:any[]=[data],at=1;
 while(at<path.length){
  token.lastIndex=at;const match=token.exec(path);if(!match)throw new Error('不支持的 JSONPath：'+path);at=token.lastIndex;
  const raw=match[2];let key:string|number=match[1];
  if(raw&&raw!=='*'){if(/^\d+$/.test(raw)){key=Number(raw);if(!Number.isSafeInteger(key))throw new Error('JSONPath 下标过大');}else key=raw[0]==='"'?JSON.parse(raw):raw.slice(1,-1).replace(/\\(['\\])/g,'$1');}
  const next:any[]=[];for(const node of nodes){const values=raw==='*'?(Array.isArray(node)?node:[]):node!=null&&Object.prototype.hasOwnProperty.call(node,key)?[node[key]]:[];for(const value of values){if(next.length>=20000)throw new Error('JSONPath 匹配结果过多');next.push(value);}}nodes=next;
 }
 return nodes;
}
export const substitute=(text:string,vars:Record<string,string>,encode=false)=>text.replace(/@([a-zA-Z]+)/g,(_,k)=>encode?encodeURIComponent(vars[k]??''):vars[k]??'');
export function apiRequest(rule:Rule,kind:'search'|'chapters',vars:Record<string,string>){
 const config=(kind==='search'?rule.searchApiConfig:rule.chapterApiConfig) as any;
 const request=config.request;const url=publicUrl(substitute(request.url,vars,true));
 for(const [k,v] of Object.entries(request.query||{}))url.searchParams.set(k,substitute(String(v),vars));
 const headers:Record<string,string>={'Accept':'application/json'};
 for(const [k,v] of Object.entries(request.headers||{})){if(!['accept','content-type','authorization','apikey','connect-protocol-version'].includes(k.toLowerCase()))continue;headers[k]=String(v).slice(0,2048);}
 let body:string|undefined;if(request.method==='POST'&&request.body!=null&&request.bodyType!=='none'){
  const replace=(v:any):any=>typeof v==='string'?substitute(v,vars):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
  const value=replace(request.body);if(request.bodyType==='form'){body=typeof value==='string'?value:new URLSearchParams(Object.entries(value).map(([key,value])=>[key,String(value)])).toString();headers['Content-Type']='application/x-www-form-urlencoded';}
  else{body=JSON.stringify(value);headers['Content-Type']='application/json';}
 }
 return {url:url.href,config,init:{method:request.method==='POST'?'POST':'GET',headers,...(request.method==='POST'&&body?{body}:{})}};
}
export function apiSearch(data:any,c:any,rule?:Rule){
 return selectJson(data,c.listPath).flatMap(n=>{
  const name=String(selectJson(n,c.namePath)[0]??'').trim(),source=String(selectJson(n,c.sourcePath)[0]??'').trim();if(!name||!source)return [];
  let url=c.sourceTemplate?String(c.sourceTemplate).replaceAll('@source',encodeURIComponent(source)):source;
  // API chapters consume raw IDs; XPath chapters need a same-origin page URL.
  if(rule&&rule.chapterMode!=='api')try{const base=publicUrl(rule.baseURL),target=new URL(url,base);if(target.protocol==='http:'&&target.host===base.host)target.protocol=base.protocol;url=publicUrl(target.href).href;if(new URL(url).origin!==base.origin)return [];}catch{return [];}
  return [{name,url}];
 });
}
export function apiChapters(data:any,c:any,source:string,base=c.request?.url):{name:string;episodes:{name:string;url:string;number?:number;mediaUrl?:string}[]}[]{
 const vars:Record<string,string>={source};for(const [key,path] of Object.entries(c.variables||{})){const value=selectJson(data,String(path))[0];if(value==null)throw Error('章节响应变量未匹配：'+key);vars[key]=String(value);}
 const episode=(name:string,raw:string,i:number,j:number,media?:string,number?:number)=>{
  const values={...vars,roadIndex:String(i),roadNumber:String(i+1),episodeIndex:String(j),episodeNumber:String(j+1),episodeUrl:raw};
  if(!c.episodePage&&!raw.trim())return [];
  if(c.episodePage&&(!c.episodePage.url||typeof c.episodePage.url!=='string'))throw Error('播放页地址模板不能为空');
  try{
   const url=mediaUrl(c.episodePage?substitute(c.episodePage.url,values,true):raw,base);
   for(const [key,value] of Object.entries(c.episodePage?.query||{}))url.searchParams.set(key,substitute(String(value),values));
   return [{name:name.trim()||'第 '+(j+1)+' 集',url:url.href,number,mediaUrl:isMedia(url.href)?url.href:media}];
  }catch{return [];}
 };
 if(c.format==='delimited'){
  const separators=[c.roadSeparator??'$$$',c.episodeSeparator??'#',c.fieldSeparator??'$'];if(separators.some(value=>typeof value!=='string'||!value||value.length>32))throw Error('章节分隔符必须为非空字符串');
  const [roadSeparator,episodeSeparator,fieldSeparator]=separators,names=String(selectJson(data,c.roadNamesPath)[0]??'').split(roadSeparator),raw=String(selectJson(data,c.roadEpisodesPath)[0]??'');if(!raw)return [];
  const groups=raw.split(roadSeparator);if(groups.length>64)throw Error('分集线路过多');
  return groups.map((group,i)=>{const entries=group.split(episodeSeparator);if(entries.length>5000)throw Error('分集数量过多');return {name:names[i]?.trim()||'线路 '+(i+1),episodes:entries.flatMap((entry,j)=>{const at=entry.indexOf(fieldSeparator);return at<0?[]:episode(entry.slice(0,at),entry.slice(at+fieldSeparator.length).trim(),i,j);})};}).filter(road=>road.episodes.length);
 }
 const roads=c.roadsPath===''?[data]:selectJson(data,c.roadsPath??'$.data.roads[*]');if(roads.length>64)throw Error('分集线路过多');
 return roads.map((road,i)=>{
  const entries=selectJson(road,c.episodesPath??'$.episodes[*]');if(entries.length>5000)throw Error('分集数量过多');
  return {name:String(selectJson(road,c.roadNamePath??'$.name')[0]??'').trim()||'线路 '+(i+1),episodes:entries.flatMap((ep,j)=>{
   const result=episode(String(selectJson(ep,c.episodeNamePath??'$.name')[0]??''),String(selectJson(ep,c.episodeUrlPath??'$.url')[0]??''),i,j,declaredMedia(ep)[0],Number.isFinite(ep?.episode_number)?ep.episode_number:undefined);
   if(result.length&&new URL(result[0].url).hostname==='next.xifanacg.com'&&typeof road?.code==='string'){const url=new URL(result[0].url);url.searchParams.set('source',road.code);result[0].url=url.href;}return result;
  })};
 }).filter(road=>road.episodes.length);
}
export function mediaUrl(input:string,base?:string):URL {
 const u=new URL(input,base);const check=new URL(u);check.port='';u.hostname=publicUrl(check.href).hostname;
 if(u.port&&!['8088','8443'].includes(u.port))throw new Error('不支持的视频端口');return u;
}
export const isMedia=(input:string)=>/\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(input);
export function declaredMedia(data:unknown):string[]{
 const links:string[]=[];let count=0;
 const walk=(n:any,depth=0)=>{if(depth>8||count++>2000||!n||typeof n!=='object')return;for(const [key,value] of Object.entries(n)){if(typeof value==='string'&&/^(url|src|file|play_?url|video_?url|media_?url|stream_?url)$/i.test(key)&&isMedia(value)){try{links.push(mediaUrl(value).href);}catch{}}else if(typeof value==='object')walk(value,depth+1);}};walk(data);return [...new Set(links)];
}
// Parse JSON declarations and literal URLs, without executing untrusted scripts.
export function playerLinks(html:string,base:string):string[]{
 const links:string[]=[];const add=(s:string)=>{try{links.push(mediaUrl(s.replace(/&amp;/g,'&'),base).href);}catch{}};
 for(const m of html.matchAll(/(?:var\s+)?player_[\w]+\s*=\s*\{/g)){
  const start=m.index!+m[0].length-1;let depth=0,quoted=false,escaped=false;
  for(let i=start;i<Math.min(html.length,start+65536);i++){const ch=html[i];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){try{const d=JSON.parse(html.slice(start,i+1));if(typeof d.url==='string')add(d.encrypt==2?decodeURIComponent(atob(d.url)):d.encrypt==1?decodeURIComponent(d.url):d.url);}catch{}break;}}
 }
 for(const m of html.matchAll(/<(?:video|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)){
  add(m[1]);try{for(const value of new URL(m[1].replace(/&amp;/g,'&'),base).searchParams.values())if(isMedia(value))add(value);}catch{}
 }
 for(const m of html.matchAll(/(?:\b(?:url|src|file|videoUrl|play_url|player_url)\b\s*[:=]\s*)["']([^"'\n]+)["']/g)){const value=m[1].replace(/\\\//g,'/');if(isMedia(value))add(value);}
 return [...new Set(links)].slice(0,20);
}
export function extractMedia(html:string,base:string):string[] {
 return playerLinks(html,base).filter(isMedia);
}
