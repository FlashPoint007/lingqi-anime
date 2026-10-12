import {publicUrl,Rule} from './web-core';
export function selectJson(data:unknown,path:string):any[] {
 if(!path)return [];
 if(!/^\$(?:\.[\w-]+|\[\*\]|\[\d+\])*$/.test(path))throw new Error('不支持的 JSONPath：'+path);
 let nodes:any[]=[data];for(const token of path.slice(1).match(/\.[\w-]+|\[\*\]|\[\d+\]/g)||[]){nodes=nodes.flatMap(n=>token==='[*]'?(Array.isArray(n)?n:[]):token[0]==='.'?(n?.[token.slice(1)]===undefined?[]:[n[token.slice(1)]]):(n?.[Number(token.slice(1,-1))]===undefined?[]:[n[Number(token.slice(1,-1))]]));}return nodes;
}
export const substitute=(text:string,vars:Record<string,string>,encode=false)=>text.replace(/@([a-zA-Z]+)/g,(_,k)=>encode?encodeURIComponent(vars[k]??''):vars[k]??'');
export function apiRequest(rule:Rule,kind:'search'|'chapters',vars:Record<string,string>){
 const config=(kind==='search'?rule.searchApiConfig:rule.chapterApiConfig) as any;
 const request=config.request;const url=publicUrl(substitute(request.url,vars,true));
 for(const [k,v] of Object.entries(request.query||{}))url.searchParams.set(k,substitute(String(v),vars));
 const headers:Record<string,string>={'Accept':'application/json'};
 for(const [k,v] of Object.entries(request.headers||{})){if(!['accept','content-type','authorization','apikey','connect-protocol-version'].includes(k.toLowerCase()))continue;headers[k]=String(v).slice(0,2048);}
 let body:string|undefined;if(request.body){const replace=(v:any):any=>typeof v==='string'?substitute(v,vars):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;body=JSON.stringify(replace(request.body));headers['Content-Type']='application/json';}
 return {url:url.href,config,init:{method:request.method==='POST'?'POST':'GET',headers,...(request.method==='POST'&&body?{body}:{})}};
}
export function apiSearch(data:any,c:any){return selectJson(data,c.listPath).map(n=>({name:String(selectJson(n,c.namePath)[0]??''),url:String(selectJson(n,c.sourcePath)[0]??'')})).filter(n=>n.name&&n.url);}
export function apiChapters(data:any,c:any,source:string){
 const vars:Record<string,string>={source};for(const [k,path] of Object.entries(c.variables||{}))vars[k]=String(selectJson(data,String(path))[0]??'');
 return selectJson(data,c.roadsPath||'$').map((road,i)=>({name:String(selectJson(road,c.roadNamePath)[0]??'线路 '+(i+1)),episodes:selectJson(road,c.episodesPath||'$.episodes[*]').map((ep,j)=>{const v={...vars,roadIndex:String(i),episodeIndex:String(j),episodeUrl:String(selectJson(ep,c.episodeUrlPath)[0]??'')};const url=publicUrl(substitute(c.episodePage.url,v,true));for(const [k,value] of Object.entries(c.episodePage.query||{}))url.searchParams.set(k,substitute(String(value),v));return {name:String(selectJson(ep,c.episodeNamePath)[0]??'第 '+(j+1)+' 集'),url:url.href,mediaUrl:declaredMedia(ep)[0]};})})).filter(r=>r.episodes.length);
}
export function mediaUrl(input:string,base?:string):URL {
 const u=new URL(input,base);const check=new URL(u);check.port='';publicUrl(check.href);
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
