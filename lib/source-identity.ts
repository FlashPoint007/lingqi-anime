import {knownEpisodeNumber,type Road} from './playback-client';
export const normalizeTitle=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export type SourceSubject={eps?:number;platform?:string};
export const episodic=(subject?:SourceSubject)=>!!subject&&(Number(subject.eps)>1||subject.eps!==1&&/^(?:TV|WEB|OVA|ONA)|电视|電視|网络|網絡/i.test(subject.platform||''));
export const firstSeason=(name:string)=>normalizeTitle(name).replace(/(?:第[一1][季期部]|season1)$/,'');
// Repeated !/? can identify a sequel (けいおん!!, ご注文はうさぎですか？？).
// Keep them when automatically selecting sources; explicit user aliases still apply.
const sequelPunctuation=(name:string)=>name.normalize('NFKC').match(/[!?]{2,}/g)?.join('|')||'';
export function matchesTitle(name:string,names:string[],subject?:SourceSubject){const n=normalizeTitle(name),punctuation=sequelPunctuation(name);return !!n&&names.some(value=>punctuation===sequelPunctuation(value)&&(normalizeTitle(value)===n||episodic(subject)&&firstSeason(name)===firstSeason(value)));}
export function sourceCatalogueIssue(roads:Road[],subject?:SourceSubject){
 const lines=roads.filter(road=>road.episodes.length);if(!subject||!lines.length)return '';
 // A single numbered EP is a valid ongoing series. A lone unnumbered HD/正片
 // entry is ambiguous for a multi-episode work and must not be picked silently.
 if(episodic(subject)&&lines.every(road=>road.episodes.length===1&&knownEpisodeNumber({name:road.episodes[0].name})===undefined))return '目录只有未编号的单片条目，可能为同名电影或合集，请手动确认';
 if(subject.eps===1&&lines.some(road=>road.episodes.length>3&&road.episodes.filter(episode=>(knownEpisodeNumber({name:episode.name})??0)>1).length>2))return '目录为多集连续剧，与当前单集作品不一致，请手动确认';
 return '';
}
