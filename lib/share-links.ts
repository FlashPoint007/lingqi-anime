import {emptySearchFilters,parseSearchFilters,searchFilterParams,type SearchFilters} from './search-filters';
import {currentSeason} from './catalog';
export type ShareSearch={q:string;sort:string;tag:string;category:string;year:string;page:number;filters:SearchFilters;hideCompleted:boolean;hideDropped:boolean};
export type ShareRoute={view:string;id?:number;search?:ShareSearch;calendar?:{year:number;quarter:number;day:number}};
const views=['discover','calendar','collection','history','downloads','rules','rule-test','settings'];
export function subjectHash(id:number){if(!Number.isSafeInteger(id)||id<1||id>9999999999)throw Error('番剧编号无效');return '#subject/'+id;}
export function searchHash(s:ShareSearch){const p=searchFilterParams(s.filters);for(const [key,value] of Object.entries({q:s.q,sort:s.sort,tag:s.tag,cat:s.category,year:s.year,page:String(s.page)}))if(value)p.set(key,value);if(s.hideCompleted)p.set('hideCompleted','1');if(s.hideDropped)p.set('hideDropped','1');return '#search?'+p.toString();}
export function parseShareRoute(hash:string):ShareRoute{
 if(hash.length>4096)throw Error('分享链接过长');if(!hash||hash==='#')return {view:'discover'};if(hash==='#watch/0')return {view:'settings'};
 const subject=hash.match(/^#(subject|watch)\/([1-9]\d{0,9})$/);if(subject)return {view:subject[1],id:Number(subject[2])};
 const split=hash.indexOf('?'),view=hash.slice(1,split<0?undefined:split),p=new URLSearchParams(split<0?'':hash.slice(split+1));
 if(view==='search'){
  const fields=parseSearchFilters(p),q=p.get('q')||'',sort=p.get('sort')||'popular',tag=p.get('tag')||'',category=p.get('cat')||'',year=p.get('year')||'',page=Number(p.get('page')||1);
  if(q.length>120||tag.length>40||!['popular','date','rank'].includes(sort)||category&&!['0','1','2','3','5'].includes(category)||year&&!/^(19|20)\d{2}$/.test(year)||!Number.isSafeInteger(page)||page<1||page>50000)throw Error('分享链接的搜索条件无效');
  return {view:'discover',search:{q,sort,tag,category,year,page,filters:{...emptySearchFilters,tags:fields.tags.join(','),scoreMin:p.get('scoreMin')||'',scoreMax:p.get('scoreMax')||'',rankMin:p.get('rankMin')||'',rankMax:p.get('rankMax')||'',dateFrom:fields.from,dateTo:fields.to,weekdays:fields.weekdays},hideCompleted:p.get('hideCompleted')==='1',hideDropped:p.get('hideDropped')==='1'}};
 }
 if(view==='calendar'){
  const now=currentSeason(),year=Number(p.get('year')||now.year),quarter=Number(p.get('quarter')||now.quarter),day=Number(p.get('day')||0);
  if(!Number.isInteger(year)||year<1900||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4||!Number.isInteger(day)||day<0||day>6)throw Error('分享链接的季度无效');return {view,calendar:{year,quarter,day}};
 }
 if(views.includes(view)&&!p.size)return {view};throw Error('无法识别这个站内分享链接');
}
export function siteShareURL(hash:string){return new URL('/'+hash,location.origin).href;}
