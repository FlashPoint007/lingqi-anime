import {shortcutSearchParams} from './search-query';
import snapshot from './catalog-snapshot.json';
import {parseSearchFilters} from './search-filters';
import {PAGE_SIZE,currentSeason,seasonRange,normalizeSubjects,normalizeCalendar,normalizeSubject} from './catalog';
type Upstream=(url:string,init?:RequestInit)=>Promise<any>;
const categoryCodes=new Set(['0','1','2','3','5']);
function premiereDate(subject:any){
 const value=subject.date||subject.air_date;if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:undefined;
}
const groups=(items:any[])=>Array.from({length:7},(_,i)=>({weekday:{id:i+1},items:items.filter(s=>{
 const date=premiereDate(s);if(!date)return false;
 return (new Date(date+'T12:00:00Z').getUTCDay()+6)%7===i;
})}));
export async function seasonCatalog(params:URLSearchParams,upstream:Upstream){
 const now=currentSeason(),year=Number(params.get('year')||now.year),quarter=Number(params.get('quarter')||now.quarter);
 const range=seasonRange(year,quarter);
 const signal=AbortSignal.timeout(35000);
 const services=new AbortController();
 const read:Upstream=async(url,init={})=>{try{signal.throwIfAborted();return await upstream(url,{...init,signal:AbortSignal.any([signal,...(init.signal?[init.signal]:[]),AbortSignal.timeout(6000)])});}catch(error){if(signal.aborted)throw new Error('放送时间表加载超时，请重试');throw error;}};
 const groupedCalendar=async(url:string)=>{
  const data=await read(url,{signal:services.signal});
  if(!Array.from({length:7},(_,i)=>data[String(i+1)]).every(Array.isArray))throw new Error('季度数据格式不正确');
  return Array.from({length:7},(_,i)=>({weekday:{id:i+1},items:normalizeSubjects(data[String(i+1)].map((e:any)=>e?.subject||e))}));
 };
 // Kazumi uses /p1/calendar for the current season, including continuing shows.
 // A premiere search is a different catalogue and must never race this feed.
 if(year===now.year&&quarter===now.quarter){
  try{
   const current=async(url:string)=>{const calendar=await groupedCalendar(url);if(!calendar.some(day=>day.items.length))throw Error('本周放送列表为空');return {calendar,year,quarter,basis:'current',complete:true};};
   // Only equivalent official/mirror feeds may race each other.
   return await Promise.any([current('https://next.bgm.tv/p1/calendar'),current('https://api.kazumi.fyi/p1/calendar')]);
  }catch{
   // Keep a weekly fallback available, but do not cache it as Kazumi's exact feed.
   const calendar=normalizeCalendar(await read('https://api.bgm.tv/calendar'));
   if(!calendar.some(day=>day.items.length))throw Error('本周放送列表为空，请稍后重试');
   return {calendar,year,quarter,basis:'current',complete:true,offline:true,notice:'当前使用备用放送接口，收录可能与 Kazumi 略有差异'};
  }finally{services.abort();}
 }
 try{
  const calendar=await groupedCalendar('https://api.kazumi.fyi/kazumi/v1/calendar/season?'+new URLSearchParams(range));
  // A successful HTTP response must not relabel a different season as this one.
  // Weekly feeds above intentionally keep continuing shows from older seasons.
  if(calendar.some(day=>day.items.some(subject=>{const raw=subject.date||subject.air_date,date=premiereDate(subject);return !!raw&&(!date||date<range.start||date>=range.end);})))throw Error('季度档案包含其他季度或无效的首播日期');
  services.abort();return {calendar,year,quarter,basis:'premiere',complete:true};
 }catch{
  services.abort();
  const page=async(offset:number)=>{
   const data=await read('https://api.bgm.tv/v0/search/subjects?limit='+PAGE_SIZE+'&offset='+offset,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:'',sort:'heat',filter:{type:[2],nsfw:false,air_date:['>='+range.start,'<'+range.end]}})});
   const batch=normalizeSubjects(data?.data),total=Number(data.total);if(!Number.isSafeInteger(total)||total<0)throw new Error('放送列表总数格式不正确，请重试');return {batch,total};
  };
  const first=await page(0),items=[...first.batch];let total=first.total;
  // Independent fallback pages run in bounded batches instead of waiting serially.
  for(let offset=PAGE_SIZE;offset<Math.min(total,1000);offset+=PAGE_SIZE*3){
   const batches=await Promise.all([offset,offset+PAGE_SIZE,offset+PAGE_SIZE*2].filter(n=>n<Math.min(total,1000)).map(page));for(const data of batches){items.push(...data.batch);total=Math.max(total,data.total);}
  }
  // Search and Kazumi's season archive have different inclusion criteria.
  // Prefer a stale archive during outages and recheck this fallback next visit.
  const unique=[...new Map(items.map(s=>[s.id,s])).values()],eligible=unique.filter(subject=>{const date=premiereDate(subject);return date&&date>=range.start&&date<range.end;}),complete=total<=unique.length&&eligible.length===unique.length;
  return {calendar:groups(eligible),year,quarter,basis:'premiere',complete,offline:true,notice:'季度接口暂不可用，当前为备用首播检索，收录可能与 Kazumi 略有差异'+(!complete?'；部分条目未完整返回、重复或缺少有效的本季首播日期，数据不完整':'')};
 }
}

export async function browseCatalog(params:URLSearchParams,upstream:Upstream){
 params=shortcutSearchParams(params);
 const q=(params.get('q')||'').slice(0,120),tag=(params.get('tag')||'').slice(0,40),cat=params.get('cat')||'',year=params.get('year')||'';
 const mode=['date','rank','popular'].includes(params.get('mode')||'')?params.get('mode')!:'date';
 const page=Math.min(50000,Math.max(1,Math.floor(Number(params.get('page'))||Math.floor((Number(params.get('offset'))||0)/PAGE_SIZE)+1))),offset=(page-1)*PAGE_SIZE;
 if(cat&&!categoryCodes.has(cat))throw new Error('无效分类');
 if(year&&(!/^\d{4}$/.test(year)||Number(year)<1900||Number(year)>2100))throw new Error('无效年份');
 const advanced=parseSearchFilters(params),direct=q.match(/^(?:#|id:)(\d{1,10})$/i);
 const search=Boolean(q||tag||mode==='popular'||advanced.active);
 if(cat&&search)throw new Error('分类目录与标签或热门搜索不能同时使用，请先清除其中一个筛选');
 if(search&&offset>=1000)throw new Error('搜索结果最多可浏览前 1000 条，请缩小筛选范围');
 try{
  let data:any;
  if(direct){const raw=await upstream('https://api.bgm.tv/v0/subjects/'+direct[1]);const subject=normalizeSubject(raw);if(raw?.type!==2||raw.nsfw===true||!subject||subject.id!==Number(direct[1]))throw Error('该编号不是可展示的动画条目');return {data:page===1?[subject]:[],total:1,page,offline:false,searchLimited:false};}
  if(search){
   const tags=[...new Set([tag,...advanced.tags].filter(Boolean))];if(tags.length>8)throw Error('最多选择 8 个标签');const homePopular=!q&&!tag&&!year&&!advanced.active&&mode==='popular';
   const numeric=(range:{min?:number;max?:number})=>[range.min!==undefined?'>='+range.min:'',range.max!==undefined?'<='+range.max:''].filter(Boolean);
   const dates=[...(year?['>='+year+'-01-01','<'+(Number(year)+1)+'-01-01']:[]),...(advanced.from?['>='+advanced.from]:[]),...(advanced.to?['<='+advanced.to]:[])];
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   data=await upstream('https://api.bgm.tv/v0/search/subjects?limit='+Math.min(PAGE_SIZE,1000-offset)+'&offset='+offset,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:q,sort:mode==='rank'?'rank':mode==='popular'?'heat':'match',filter:{type:[2],nsfw:false,...(tags.length?{tag:tags}:{}),...(advanced.rank?{rank:numeric(advanced.rank)}:mode==='rank'?{rank:['>0','<=99999']}:{}),...(advanced.rating?{rating:numeric(advanced.rating)}:{}),...(advanced.weekdays.length?{air_weekday:advanced.weekdays}:{}),...(homePopular?{air_date:['<='+today]}:{}),...(dates.length?{air_date:dates}:{})}})});
  }else{
   const query=new URLSearchParams({type:'2',sort:mode,limit:String(PAGE_SIZE),offset:String(offset)});if(cat)query.set('cat',cat);if(year)query.set('year',year);
   data=await upstream('https://api.bgm.tv/v0/subjects?'+query);
  }
  const items=normalizeSubjects(data?.data).slice(0,search?Math.min(PAGE_SIZE,1000-offset):PAGE_SIZE),total=Number(data.total);if(!Number.isSafeInteger(total)||total<0)throw new Error('番剧列表总数不正确，请重试');
  return {...data,total:Math.floor(total),data:items,page,offline:false,searchLimited:search&&total>=1000};
 }catch(error){
  if(q||tag||cat||year||advanced.active||page!==1)throw error;
  // A finite snapshot is never presented as a full live catalogue.
  const items=snapshot.data.slice(0,PAGE_SIZE);return {data:items,total:items.length,limit:PAGE_SIZE,offset:0,page:1,offline:true,searchLimited:false};
 }
}
