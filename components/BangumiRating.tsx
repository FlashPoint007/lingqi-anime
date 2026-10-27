import {Star,ArrowUpRight} from 'lucide-react';
import type {Subject} from '../lib/catalog';
import {bangumiRating} from '../lib/bangumi-rating';

export default function BangumiRating({subject,compact=false}:{subject:Subject;compact?:boolean}){
 const {score,total,rank}=bangumiRating(subject);
 return <a className={'bangumi-rating'+(compact?' bangumi-rating-compact':'')} href={'https://bgm.tv/subject/'+subject.id} target="_blank" rel="noreferrer" aria-label={'Bangumi 评分：'+(score===undefined?'暂无评分':score.toFixed(1)+' 分')+(total?'，'+total+' 人评分':'')}>
  <span className="bangumi-rating-value"><Star size={compact?12:16} fill="currentColor"/><b>{score===undefined?'暂无评分':score.toFixed(1)}</b></span><span>Bangumi 评分</span>{!compact&&<small>{total?total.toLocaleString('zh-CN')+' 人评分':'评分人数未收录'}{rank?' · #'+rank.toLocaleString('zh-CN'):''}</small>}<ArrowUpRight size={12}/>
 </a>;
}
