import {emptySearchFilters,parseSearchFilters,searchFilterParams,type SearchFilters} from './search-filters';
export type SearchQuery={keyword:string;filters:SearchFilters;sort?:'date'|'rank'|'popular';syntax:boolean};
function searchTokens(input:string){
 const tokens:string[]=[];let token='',quote='';
 for(let i=0;i<input.length;i++){
  const char=input[i];if(!quote&&/\s/.test(char)){if(token)tokens.push(token);token='';continue;}
  if(char==='"'||char==="'"){
   if(quote===char)quote='';
   else if(!quote&&(!token||/^(?:id|tag|sort|season|date|rank|score|weekday):$/i.test(token))){
    const end=input.indexOf(char,i+1);if(end>=0&&(end===input.length-1||/\s/.test(input[end+1])))quote=char;
    else if(token)throw Error('搜索条件的引号未闭合');
   }
  }
  token+=char;
 }
 if(quote)throw Error('搜索条件的引号未闭合');if(token)tokens.push(token);return tokens;
}
// Explicit tokens only; ordinary titles containing ':' remain ordinary titles.
export function parseSearchQuery(input:string):SearchQuery{
 if(input.length>500)throw Error('搜索内容不能超过 500 字');const filters:SearchFilters={...emptySearchFilters,weekdays:[]},terms:string[]=[],tags:string[]=[],seen=new Set<string>();let sort:SearchQuery['sort'],id='',syntax=false;
 const tokens=searchTokens(input);
 for(const token of tokens){const match=token.match(/^(id|tag|sort|season|date|rank|score|weekday):(.*)$/i);if(!match){terms.push(token);continue;}syntax=true;const key=match[1].toLowerCase(),value=match[2].replace(/^(["'])(.*)\1$/,'$2');if(!value)throw Error(key+': 后面需要填写条件');if(key!=='tag'&&seen.has(key))throw Error(key+': 条件不能重复');seen.add(key);
  if(key==='tag'){tags.push(value);continue;}
  if(key==='id'){if(!/^[1-9]\d{0,9}$/.test(value))throw Error('id: 需要有效的 Bangumi 编号');id=value;continue;}
  if(key==='sort'){const modes:Record<string,'date'|'rank'|'popular'>={heat:'popular',popular:'popular',rank:'rank',score:'rank',date:'date'};sort=modes[value.toLowerCase()];if(!sort)throw Error('sort: 支持 heat、rank、score、date');continue;}
  if(key==='season'){const m=value.match(/^(\d{4})Q([1-4])$/i);if(!m||Number(m[1])<1900||Number(m[1])>2100)throw Error('season: 示例为 2023Q4');const year=Number(m[1]),month=(Number(m[2])-1)*3;filters.dateFrom=new Date(Date.UTC(year,month-1,1)).toISOString().slice(0,10);filters.dateTo=new Date(Date.UTC(year,month+2,0)).toISOString().slice(0,10);continue;}
  if(key==='weekday'){if(!/^[1-7](?:,[1-7])*$/.test(value))throw Error('weekday: 使用 1—7，多个星期用逗号分隔');filters.weekdays=[...new Set(value.split(',').map(Number))];continue;}
  if(key==='date'){const m=value.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);if(!m)throw Error('date: 示例为 2023-10-01..2023-12-31');filters.dateFrom=m[1];filters.dateTo=m[2];continue;}
  const m=value.match(/^(\d+(?:\.\d+)?)?\.\.(\d+(?:\.\d+)?)?$/);if(!m||!m[1]&&!m[2])throw Error(key+': 使用下限..上限，例如 '+key+':8..10');if(key==='score'){filters.scoreMin=m[1]||'';filters.scoreMax=m[2]||'';}else{filters.rankMin=m[1]||'';filters.rankMax=m[2]||'';}
 }
 if(seen.has('season')&&seen.has('date'))throw Error('season: 与 date: 请选择一种日期条件');if(id&&(terms.length||seen.size>1))throw Error('按 id: 定位时请移除其他条件');filters.tags=[...new Set(tags)].join(',');parseSearchFilters(searchFilterParams(filters));
 const keyword=id?'id:'+id:terms.map(term=>term.replace(/^(["'])(.*)\1$/,'$2')).join(' ').trim();if(keyword.length>120)throw Error('番剧关键词不能超过 120 字');return {keyword,filters,sort,syntax};
}

export function shortcutSearchParams(input:URLSearchParams){const params=new URLSearchParams(input);if(params.get('literal')==='1'){if((params.get('q')||'').length>120)throw Error('番剧关键词不能超过 120 字');return params;}const parsed=parseSearchQuery(params.get('q')||'');params.set('literal','1');params.set('q',parsed.keyword);if(!parsed.syntax)return params;for(const key of ['tags','scoreMin','scoreMax','rankMin','rankMax','dateFrom','dateTo','weekdays'])params.delete(key);for(const [key,value]of searchFilterParams(parsed.filters))params.set(key,value);if(parsed.sort)params.set('mode',parsed.sort);return params;}
