'use client';
import {Play,ChevronRight} from 'lucide-react';
import AnimeCover from './AnimeCover';
import {continueWatching,watchResume} from '../lib/watch-resume';
import {episodeLabel} from '../lib/playback-client';
import {playbackTime} from '../lib/player-controls';
import type {WatchRecord} from '../lib/personal-data';
import type {Subject} from '../lib/catalog';
export default function ContinueWatching({history,collection,ready,privatePlayback,playResume,onResume,onAll}:{history:WatchRecord[];collection:Subject[];ready:boolean;privatePlayback:boolean;playResume:boolean;onResume:(record:WatchRecord)=>void;onAll:()=>void}){
 if(!ready||privatePlayback)return null;const items=continueWatching(history,collection);if(!items.length)return null;
 return <section className="continue-watching" aria-label="继续观看"><div className="section-heading"><div><h2>继续观看</h2><span>接着上次的故事</span></div><button type="button" className="text-button" onClick={onAll}>全部观看记录 <ChevronRight size={14}/></button></div><div className="continue-watching-list">{items.map(record=>{const state=watchResume(record),title=record.subject.name_cn||record.subject.name,label=episodeLabel(record.episode,record.number);return <article key={record.subject.id}><AnimeCover src={record.subject.images?.common||record.subject.images?.large} alt={title} lazy/><div><h3>{title}</h3><p>{label}</p><small>上次停在 {playbackTime(state.position)}{state.duration?' / '+playbackTime(state.duration):''}</small>{state.ratio!==undefined&&<progress aria-label={title+'观看进度'} value={state.ratio} max={1}/>}<button type="button" className="secondary" aria-label={(playResume?'继续观看 ':'从头播放 ')+title+' · '+label} onClick={()=>onResume(record)}><Play size={13}/>{playResume?'继续观看':'从头播放'}</button></div></article>;})}</div></section>;
}
