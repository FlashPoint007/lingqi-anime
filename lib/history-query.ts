import type {WatchRecord} from './personal-data';
import type {SubjectAliases} from './subject-aliases';
export type HistoryRange='all'|'today'|'week'|'month';
const DAY=86400000,BEIJING_OFFSET=8*3600000;
export function historyDay(time:number){return Math.floor((time+BEIJING_OFFSET)/DAY);}
export function historyResults(items:WatchRecord[],query:string,range:HistoryRange,aliases:SubjectAliases={},now=Date.now()){
 const terms=query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean),today=historyDay(now),days=range==='today'?1:range==='week'?7:range==='month'?30:Infinity;
 return items.filter(item=>{
  const day=historyDay(item.time),text=[item.subject.name,item.subject.name_cn,...(aliases[String(item.subject.id)]||[]),item.episode,item.ruleName].filter(Boolean).join('\n').normalize('NFKC').toLowerCase();
  return (range==='all'||day<=today&&day>today-days)&&terms.every(term=>text.includes(term));
 }).sort((a,b)=>b.time-a.time);
}
export function historyGroups(items:WatchRecord[],now=Date.now()){
 const groups=new Map<number,{day:number;label:string;items:WatchRecord[]}>(),today=historyDay(now);
 for(const item of [...items].sort((a,b)=>b.time-a.time)){
  const day=historyDay(item.time);let group=groups.get(day);
  if(!group){const date=new Date(day*DAY);group={day,label:day===today?'今天':day===today-1?'昨天':Number.isFinite(date.getTime())?date.toISOString().split('T')[0]:'日期不详',items:[]};groups.set(day,group);}
  group.items.push(item);
 }
 return [...groups.values()];
}
