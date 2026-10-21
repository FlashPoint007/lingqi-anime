'use client';
import {useEffect,useState} from 'react';
import {SlidersHorizontal,Search} from 'lucide-react';
import {emptySearchFilters,hasSearchFilters,parseSearchFilters,searchFilterParams,type SearchFilters} from '../lib/search-filters';
export default function AdvancedSearch({value,onApply}:{value:SearchFilters;onApply:(value:SearchFilters)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('');
 useEffect(()=>{setDraft(value);setError('');},[value]);
 const field=(key:Exclude<keyof SearchFilters,'weekdays'>,label:string,type='number',placeholder='不限')=><label>{label}<input type={type} aria-label={label} value={draft[key]} placeholder={placeholder} step={key.startsWith('score')?'0.1':undefined} min={type==='number'?0:undefined} max={key.startsWith('score')?10:undefined} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <details className="advanced-search"><summary><SlidersHorizontal size={15}/>高级筛选{hasSearchFilters(value)&&<span>已应用</span>}</summary><form onSubmit={e=>{e.preventDefault();try{parseSearchFilters(searchFilterParams(draft));setError('');onApply({...draft,weekdays:[...draft.weekdays]});}catch(e){setError((e as Error).message);}}}>
  <div className="advanced-search-grid">{field('tags','组合标签','text','例如：奇幻，冒险（逗号分隔）')}{field('dateFrom','首播日期从','date')}{field('dateTo','首播日期至','date')}{field('scoreMin','最低评分')}{field('scoreMax','最高评分')}{field('rankMin','排名从')}{field('rankMax','排名至')}</div>
  <fieldset className="advanced-weekdays"><legend>放送星期</legend>{['一','二','三','四','五','六','日'].map((d,i)=><label key={d}><input type="checkbox" checked={draft.weekdays.includes(i+1)} onChange={e=>setDraft({...draft,weekdays:e.target.checked?[...draft.weekdays,i+1]:draft.weekdays.filter(n=>n!==i+1)})}/>周{d}</label>)}</fieldset>
  <p className="muted">组合标签同时筛选，最多 8 个。结果由目录服务筛选后分页。可在搜索框输入 #条目编号 精确定位。</p>
  {error&&<p role="alert" className="feature-error">{error}</p>}
  <div className="button-row"><button className="primary" type="submit"><Search size={14}/>应用筛选</button><button className="secondary" type="button" onClick={()=>{setDraft({...emptySearchFilters,weekdays:[]});setError('');onApply({...emptySearchFilters,weekdays:[]});}}>清除高级条件</button></div>
 </form></details>;
}
