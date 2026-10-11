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
 return selectJson(data,c.roadsPath||'$').map((road,i)=>({name:String(selectJson(road,c.roadNamePath)[0]??'线路 '+(i+1)),episodes:selectJson(road,c.episodesPath||'$.episodes[*]').map((ep,j)=>{const v={...vars,roadIndex:String(i),episodeIndex:String(j),episodeUrl:String(selectJson(ep,c.episodeUrlPath)[0]??'')};const url=publicUrl(substitute(c.episodePage.url,v,true));for(const [k,value] of Object.entries(c.episodePage.query||{}))url.searchParams.set(k,substitute(String(value),v));return {name:String(selectJson(ep,c.episodeNamePath)[0]??'第 '+(j+1)+' 集'),url:url.href};})})).filter(r=>r.episodes.length);
}
// Extract only declared media links; never evaluate a source page's JavaScript.
export function extractMedia(html:string,base:string):string[] {
 const links:string[]=[];const add=(s:string)=>{try{const u=publicUrl(new URL(s.replace(/&amp;/g,'&'),base).href);if(/\.(mp4|webm|m3u8)(?:\?|$)/i.test(u.href))links.push(u.href);}catch{}};
 for(const m of html.matchAll(/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))add(m[1]);
 for(const m of html.matchAll(/(?:var\s+)?player_[\w]+\s*=\s*(\{[^\n;]+\})/g)){try{const d=JSON.parse(m[1]);if(typeof d.url==='string')add(d.encrypt==2?atob(d.url):d.encrypt==1?decodeURIComponent(d.url):d.url);}catch{}}
 return [...new Set(links)];
}
