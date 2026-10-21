import snapshot from './catalog-snapshot.json';
import {parseSearchFilters} from './search-filters';
import {PAGE_SIZE,currentSeason,seasonRange,normalizeSubjects,normalizeCalendar,normalizeSubject} from './catalog';
type Upstream=(url:string,init?:RequestInit)=>Promise<any>;
const categoryCodes=new Set(['0','1','2','3','5']);
const groups=(items:any[])=>Array.from({length:7},(_,i)=>({weekday:{id:i+1},items:items.filter(s=>{
 const date=s.date||s.air_date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
 return (new Date(date+'T12:00:00Z').getUTCDay()+6)%7===i;
})}));
export async function seasonCatalog(params:URLSearchParams,upstream:Upstream){
 const now=currentSeason(),year=Number(params.get('year')||now.year),quarter=Number(params.get('quarter')||now.quarter);
 const range=seasonRange(year,quarter);
 const signal=AbortSignal.timeout(35000);
 const services=new AbortController();
 const read:Upstream=async(url,init={})=>{try{signal.throwIfAborted();return await upstream(url,{...init,signal:AbortSignal.any([signal,...(init.signal?[init.signal]:[]),AbortSignal.timeout(6000)])});}catch(error){if(signal.aborted)throw new Error('放送时间表加载超时，请重试');throw error;}};
 const kazumi=async()=>{
  const data=await read('https://api.kazumi.fyi/kazumi/v1/calendar/season?'+new URLSearchParams(range),{signal:services.signal});
  if(!Array.from({length:7},(_,i)=>data[String(i+1)]).every(Array.isArray))throw new Error('季度数据格式不正确');
  const calendar=Array.from({length:7},(_,i)=>({weekday:{id:i+1},items:normalizeSubjects(data[String(i+1)].map((e:any)=>e?.subject||e))}));
  return {calendar,year,quarter,basis:'premiere',complete:true};
 };
 try{
  const candidates=[kazumi()];
  if(year===now.year&&quarter===now.quarter)candidates.push((async()=>{const calendar=normalizeCalendar(await read('https://api.bgm.tv/calendar',{signal:services.signal}));return {calendar,year,quarter,basis:'current',complete:true};})());
  const result=await Promise.any(candidates);services.abort();return result;
 }catch{
  services.abort();
  const page=async(offset:number)=>{
   const data=await read('https://api.bgm.tv/v0/search/subjects?limit='+PAGE_SIZE+'&offset='+offset,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:'',sort:'heat',filter:{type:[2],nsfw:false,air_date:['>='+range.start,'<'+range.end]}})});
   const batch=normalizeSubjects(data?.data),total=Number(data.total);if(!Number.isSafeInteger(total)||total<0)throw new Error('放送列表总数格式不正确，请重试');return {batch,total};
  };
  const first=await page(0),items=[...first.batch];let total=first.total;
  // Independent fallback pages run in bounded batches instead of waiting serially.
  if(first.batch.length===PAGE_SIZE)for(let offset=PAGE_SIZE;offset<Math.min(total,1000);offset+=PAGE_SIZE*3){
   const batches=await Promise.all([offset,offset+PAGE_SIZE,offset+PAGE_SIZE*2].filter(n=>n<Math.min(total,1000)).map(page));for(const data of batches){items.push(...data.batch);total=Math.max(total,data.total);}
  }
  const unique=[...new Map(items.map(s=>[s.id,s])).values()];return {calendar:groups(unique),year,quarter,basis:'premiere',complete:total<=unique.length};
 }
}

export async function browseCatalog(params:URLSearchParams,upstream:Upstream){
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
