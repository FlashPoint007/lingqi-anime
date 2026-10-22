import type {Subject} from './catalog';
import type {SubjectAliases} from './subject-aliases';
import {collectionState,type CollectionState} from './collection-state';
export function collectionResults(items:Subject[],query:string,state:CollectionState|'',sort:string,aliases:SubjectAliases={}){
 const terms=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean),text=(s:Subject)=>[s.name,s.name_cn,...(aliases[String(s.id)]||[])].filter(Boolean).join('\n').normalize('NFKC').toLocaleLowerCase();
 return items.filter(s=>(!state||collectionState(s.collectionStatus)===state)&&terms.every(term=>text(s).includes(term))).map((subject,index)=>({subject,index})).sort((a,b)=>{
  const x=a.subject,y=b.subject;let order=0;if(sort==='name')order=(x.name_cn||x.name).localeCompare(y.name_cn||y.name,'zh-CN');if(sort==='score')order=(y.rating?.score||y.score||0)-(x.rating?.score||x.score||0);if(sort==='date')order=(y.date||y.air_date||'').localeCompare(x.date||x.air_date||'');return order||a.index-b.index;
 }).map(item=>item.subject);
}
