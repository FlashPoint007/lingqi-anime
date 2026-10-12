export const PAGE_SIZE=24;
export type Subject={id:number;name:string;name_cn?:string;images?:{large?:string;common?:string};rating?:{score:number;rank?:number;total?:number};score?:number;rank?:number;date?:string;air_date?:string;summary?:string;eps?:number;platform?:string;tags?:{name:string}[]};
export const categories=[{value:'',label:'全部类型'},{value:'1',label:'TV 动画'},{value:'3',label:'剧场版'},{value:'2',label:'OVA'},{value:'5',label:'WEB 动画'},{value:'0',label:'其他'}];
export const animeTags=['','日常','原创','校园','搞笑','奇幻','百合','恋爱','悬疑','热血','后宫','机战','轻改','偶像','治愈','异世界','冒险','科幻'];
export const seasonNames=['冬季','春季','夏季','秋季'];
export function currentSeason(){const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});const [year,month]=date.split('-').map(Number);return {year,quarter:Math.ceil(month/3)};}
// Kazumi includes the month before each quarter to retain early premieres.
export function seasonRange(year:number,quarter:number){
 if(!Number.isInteger(year)||year<1900||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4)throw new Error('无效的放送季度');
 const format=(d:Date)=>d.toISOString().slice(0,10);
 return {start:format(new Date(Date.UTC(year,(quarter-1)*3-1,1))),end:format(new Date(Date.UTC(year,quarter*3-1,1)))};
}
export function pageNumbers(page:number,pages:number){return [...new Set([1,...Array.from({length:5},(_,i)=>page+i-2).filter(n=>n>0&&n<=pages),pages])].sort((a,b)=>a-b);}
