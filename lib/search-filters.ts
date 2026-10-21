export type SearchFilters={tags:string;scoreMin:string;scoreMax:string;rankMin:string;rankMax:string;dateFrom:string;dateTo:string;weekdays:number[]};
export const emptySearchFilters:SearchFilters={tags:'',scoreMin:'',scoreMax:'',rankMin:'',rankMax:'',dateFrom:'',dateTo:'',weekdays:[]};
export const searchFilterKeys=['tags','scoreMin','scoreMax','rankMin','rankMax','dateFrom','dateTo','weekdays'] as const;
export function searchFilterParams(value:SearchFilters){const p=new URLSearchParams();for(const key of searchFilterKeys){const text=key==='weekdays'?[...new Set(value.weekdays)].sort().join(','):value[key].trim();if(text)p.set(key,text);}return p;}
export function hasSearchFilters(value:SearchFilters){return searchFilterParams(value).size>0;}
function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2100-12-31'||!Number.isFinite(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('请输入有效的播出日期');return value;}
export function parseSearchFilters(params:URLSearchParams){
 const bounded=(key:string)=>{const value=params.get(key)||'';if(value.length>320)throw Error('筛选条件过长');return value.trim();};
 const tags=[...new Set(bounded('tags').split(/[,，\n]/).map(s=>s.trim()).filter(Boolean))];if(tags.length>8||tags.some(t=>t.length>40))throw Error('最多选择 8 个标签，每个标签不超过 40 字');
 const range=(minKey:string,maxKey:string,max:number,integer=false)=>{const rawMin=bounded(minKey),rawMax=bounded(maxKey);if(!rawMin&&!rawMax)return;const min=rawMin?Number(rawMin):undefined,high=rawMax?Number(rawMax):undefined;for(const n of [min,high])if(n!==undefined&&(!Number.isFinite(n)||n<0||n>max||integer&&!Number.isInteger(n)))throw Error(integer?'排名须为 0—999999 的整数':'评分须为 0—10 的数字');if(min!==undefined&&high!==undefined&&min>high)throw Error('筛选下限不能大于上限');return {min,max:high};};
 const rating=range('scoreMin','scoreMax',10),rank=range('rankMin','rankMax',999999,true),from=bounded('dateFrom'),to=bounded('dateTo');if(from)date(from);if(to)date(to);if(from&&to&&from>to)throw Error('开始日期不能晚于结束日期');
 const rawDays=bounded('weekdays'),weekdays=rawDays?[...new Set(rawDays.split(',').map(Number))].sort():[];if(weekdays.length>7||weekdays.some(n=>!Number.isInteger(n)||n<1||n>7))throw Error('放送星期无效');
 return {tags,rating,rank,from,to,weekdays,active:!!(tags.length||rating||rank||from||to||weekdays.length)};
}
export function searchHistory(value:unknown):string[]{return Array.isArray(value)?[...new Set(value.filter((q):q is string=>typeof q==='string').map(q=>q.trim().slice(0,120)).filter(Boolean))].slice(0,12):[];}
