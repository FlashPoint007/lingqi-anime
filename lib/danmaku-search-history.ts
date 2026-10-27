export const danmakuHistoryKey='kw-danmaku-search-history-v1';
type Entry={subject:number;terms:string[];updated:number};
type History=Record<string,Entry[]>;
export function danmakuKeyword(raw:unknown){return typeof raw==='string'?raw.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';}
export function cleanDanmakuHistory(raw:unknown):History{
 const result:History=Object.create(null);if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
 for(const [owner,items] of Object.entries(raw).slice(0,10)){
  if(!owner||owner.length>120||!Array.isArray(items))continue;
  const seen=new Set<number>();result[owner]=items.slice(0,100).flatMap((item:any)=>{
   if(!Number.isSafeInteger(item?.subject)||item.subject<=0||seen.has(item.subject)||!Array.isArray(item.terms))return [];seen.add(item.subject);
   return [{subject:item.subject,terms:[...new Set<string>(item.terms.map(danmakuKeyword).filter(Boolean))].slice(0,5),updated:Number.isFinite(item.updated)?Math.max(0,item.updated):0}];
  }).sort((a,b)=>b.updated-a.updated);
 }return result;
}
export function rememberDanmakuSearch(raw:unknown,owner:string,subject:number,keyword:string,now=Date.now()):History{
 const history=cleanDanmakuHistory(raw),term=danmakuKeyword(keyword);
 if(!owner||owner.length>120||!Number.isSafeInteger(subject)||subject<=0||!term)return history;
 const previous=history[owner]?.find(item=>item.subject===subject);
 history[owner]=[{subject,terms:[term,...(previous?.terms||[]).filter(t=>t!==term)].slice(0,5),updated:now},...(history[owner]||[]).filter(item=>item.subject!==subject)].slice(0,100);
 // Bound shared-device data without mixing accounts or exposing another account's terms.
 return Object.fromEntries(Object.entries(history).sort((a,b)=>(b[1][0]?.updated||0)-(a[1][0]?.updated||0)).slice(0,10));
}
