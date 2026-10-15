// Browser adaptation of Kazumi's XPath rule model, GPL-3.0.
export type Rule = {name:string; version?:string; baseURL:string; searchURL:string; searchList:string; searchName:string; searchResult:string; chapterRoads:string; chapterResult:string; usePost?:boolean; searchMode?:string; chapterMode?:string; enabled?:boolean; [key:string]:unknown};
export function publicUrl(input:string):URL {
  const u=new URL(input); const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^\d/.test(h)||h.includes(':')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.localhost')||h==='localhost') throw new Error('仅支持公开 HTTPS 域名');
  return u;
}
export function validateRule(input:unknown):Rule {
  if(!input||typeof input!=='object') throw new Error('规则必须为 JSON 对象');
  const r=input as Rule;
  for(const k of ['name','baseURL']) if(typeof r[k]!=='string'||!(r[k] as string).trim()) throw new Error('规则缺少字段：'+k);
  if(r.searchMode==='api') {
    for(const key of ['searchApiConfig','chapterApiConfig']){const c=r[key] as any;if(!c?.request?.url)throw new Error('API 规则缺少 '+key);publicUrl(c.request.url.replace(/@[a-zA-Z]+/g,'test'));}
  } else {
    for(const k of ['searchURL','searchList','searchName','searchResult','chapterRoads','chapterResult']) if(typeof r[k]!=='string'||!(r[k] as string).trim()) throw new Error('规则缺少字段：'+k);
  }
  if(r.name.length>100) throw new Error('规则名称过长');
  const base=publicUrl(r.baseURL); const search=r.searchMode==='api'?base:publicUrl(r.searchURL.replaceAll('@keyword','test'));
  if(base.origin!==search.origin) throw new Error('搜索地址必须与规则 baseURL 同源');
  return {...r,version:typeof r.version==='string'||typeof r.version==='number'?String(r.version):undefined,enabled:r.enabled!==false};
}
export function parseRules(text:string):Rule[] {
  if(text.length>1024*1024) throw new Error('规则文件不能超过 1 MB');
  let t=text.trim();
  if(t.startsWith('kazumi://')) {
    const raw=decodeURIComponent(t.slice(9));
    t=new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
  }
  const data=JSON.parse(t); const list=Array.isArray(data)?data:[data];
  if(list.length>100) throw new Error('一次最多导入 100 条规则');
  return list.map(validateRule);
}
export function sourcePageError(html:string):string {
 if(html.length>50000)return '';
 const heading=html.match(/<(?:title|h1)[^>]*>([^<]*)</i)?.[1]?.trim()||'';
 if(/(?:404|not found|页面不存在|页面未找到)/i.test(heading))return '源站返回了不存在的页面（404）';
 if(/(?:site unavailable|service unavailable|access denied|forbidden)/i.test(heading))return '源站当前不可访问，请稍后重试或更换视频源';
 if(/(?:cf-chl-|Verify you are human|<title>\s*Human Verification|captcha)/i.test(html))return '源站要求验证，当前无法检测资源';
 return '';
}
export function xpath(context:Node,expression:string):Node[] {
  const doc=context.nodeType===9?context as Document:context.ownerDocument!;
  // Kazumi accepts // as the chapter document, and /self::* relative to a road.
  const expr=expression==='//' ? '.' : context.nodeType!==9&&expression.startsWith('/')?'.'+expression:expression;
  const result=doc.evaluate(expr,context,null,7,null); return Array.from({length:result.snapshotLength},(_,i)=>result.snapshotItem(i)!);
}
export function link(node:Node,base:string):string|null {
  const href=node.nodeType===2?node.nodeValue:(node as Element).getAttribute?.('href');
  if(!href?.trim()||href.trim().startsWith('#')) return null;
  try {const u=new URL(href,base);if(u.protocol==='http:'&&u.hostname===new URL(base).hostname)u.protocol='https:';return u.protocol==='https:'?u.href:null;} catch{return null;}
}
export function parseSearch(html:string,r:Rule,pageUrl=r.baseURL):{name:string;url:string}[] {
  const doc=new DOMParser().parseFromString(html,'text/html');
  return xpath(doc,r.searchList).flatMap(n=>{const title=xpath(n,r.searchName)[0]?.textContent?.trim(); const target=xpath(n,r.searchResult)[0]; const url=target&&link(target,pageUrl);return title&&url?[{name:title,url}]:[];});
}
export function parseChapters(html:string,r:Rule,pageUrl=r.baseURL):{name:string;episodes:{name:string;url:string}[]}[] {
  const doc=new DOMParser().parseFromString(html,'text/html');
  return xpath(doc,r.chapterRoads).map((n,i)=>({name:'线路 '+(i+1),episodes:xpath(n,r.chapterResult).flatMap((e,j)=>{const url=link(e,pageUrl);return url?[{name:e.textContent?.trim()||'第 '+(j+1)+' 集',url}]:[];})})).filter(r=>r.episodes.length);
}
