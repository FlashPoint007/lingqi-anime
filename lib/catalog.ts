// Bangumi search clamps page size to 20, even when a larger limit is requested.
export const PAGE_SIZE=20;
export type Subject={id:number;name:string;name_cn?:string;images?:{large?:string;common?:string};rating?:{score:number;rank?:number;total?:number};score?:number;rank?:number;date?:string;air_date?:string;summary?:string;eps?:number;platform?:string;tags?:{name:string}[]};
export const categories=[{value:'',label:'全部类型'},{value:'1',label:'TV 动画'},{value:'3',label:'剧场版'},{value:'2',label:'OVA'},{value:'5',label:'WEB 动画'},{value:'0',label:'其他'}];
export const animeTags=['','日常','原创','校园','搞笑','奇幻','百合','恋爱','悬疑','热血','后宫','机战','轻改','偶像','治愈','异世界','冒险','科幻'];
export const seasonNames=['冬季','春季','夏季','秋季'];
export function scoreLabel(value:number){return Number.isFinite(value)&&value>0?value.toFixed(1):'暂无评分';}
export function catalogYears(items:Subject[],year=currentSeason().year,selected=''){const years=[Number(selected),...items.map(s=>Number((s.date||s.air_date||'').slice(0,4)))].filter(y=>Number.isInteger(y)&&y>=1900&&y<=2100);const latest=Math.min(2100,Math.max(year+2,...years));return Array.from({length:latest-1900+1},(_,i)=>latest-i);}
export function currentSeason(){const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric'}).formatToParts(new Date());const year=Number(parts.find(p=>p.type==='year')?.value),month=Number(parts.find(p=>p.type==='month')?.value);return {year,quarter:Math.ceil(month/3)};}
// Kazumi includes the month before each quarter to retain early premieres.
export function seasonRange(year:number,quarter:number){
 if(!Number.isInteger(year)||year<1900||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4)throw new Error('无效的放送季度');
 const format=(d:Date)=>d.toISOString().slice(0,10);
 return {start:format(new Date(Date.UTC(year,(quarter-1)*3-1,1))),end:format(new Date(Date.UTC(year,quarter*3-1,1)))};
}
export function pageNumbers(page:number,pages:number){return [...new Set([1,...Array.from({length:5},(_,i)=>page+i-2).filter(n=>n>0&&n<=pages),pages])].sort((a,b)=>a-b);}

const text=(value:unknown)=>typeof value==='string'?value:'';
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
export function normalizeSubject(value:any):Subject|undefined {
 if(!value||!Number.isSafeInteger(value.id)||value.id<=0)return;
 const name=text(value.name)||text(value.name_cn)||text(value.nameCN);if(!name.trim())return;
 return {id:value.id,name,name_cn:text(value.name_cn)||text(value.nameCN),summary:text(value.summary),date:text(value.date)||text(value.air_date)||text(value.airtime?.date),
  images:{large:text(value.images?.large)||undefined,common:text(value.images?.common)||undefined},eps:number(value.eps),score:number(value.score),rank:number(value.rank),platform:text(value.platform),
  rating:number(value.rating?.score)===undefined?undefined:{score:value.rating.score,rank:number(value.rating.rank),total:number(value.rating.total)}};
}
export function normalizeSubjects(value:unknown):Subject[] {
 if(!Array.isArray(value))throw new Error('番剧列表格式不正确，请重试');
 const data=value.map(normalizeSubject).filter((s):s is Subject=>!!s);
 if(value.length&&!data.length)throw new Error('番剧列表没有有效条目，请重试');
 return [...new Map(data.map(s=>[s.id,s])).values()];
}
export function normalizeCalendar(value:any){
 if(!Array.isArray(value)||!value.length||value.some(day=>!Number.isInteger(day?.weekday?.id)||day.weekday.id<1||day.weekday.id>7||!Array.isArray(day.items)))throw new Error('放送时间表格式不正确，请重试');
 return Array.from({length:7},(_,i)=>({weekday:{id:i+1},items:normalizeSubjects(value.filter(day=>day.weekday.id===i+1).flatMap(day=>day.items))}));
}
export function normalizeEpisodes(value:any){
 if(!Array.isArray(value?.data))throw new Error('剧集目录格式不正确，请重试');
 const data=value.data.filter((e:any)=>e&&Number.isSafeInteger(e.id)&&e.id>0&&number(e.sort)!==undefined).map((e:any)=>({id:e.id,sort:e.sort,name:text(e.name),name_cn:text(e.name_cn)}));
 if(value.data.length&&!data.length)throw new Error('剧集目录没有有效条目，请重试');
 return {data,total:Math.max(number(value.total)||0,data.length)};
}
