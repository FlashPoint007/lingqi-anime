import {knownEpisodeNumber,type Road} from './playback-client';
export const normalizeTitle=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export type SourceSubject={eps?:number;platform?:string};
export const episodic=(subject?:SourceSubject)=>!!subject&&(Number(subject.eps)>1||subject.eps!==1&&/^(?:TV|WEB|OVA|ONA)|电视|電視|网络|網絡/i.test(subject.platform||''));
export const firstSeason=(name:string)=>normalizeTitle(name).replace(/(?:第[一1][季期部]|season1)$/,'');
function seasonNumber(value:string){
 if(/^\d{1,2}$/.test(value))return Number(value)||undefined;
 const digits='零一二三四五六七八九',parts=value.split('十');
 if(parts.length===1&&value.length===1&&digits.includes(value))return digits.indexOf(value)||undefined;
 if(parts.length===2&&parts.every(part=>!part||part.length===1&&digits.includes(part)))return (parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0);
}
function titleIdentity(name:string){
 const value=name.normalize('NFKC').trim().toLowerCase().replace(/[’‘′]/g,"'");
 const match=value.match(/^(.*?)(?:第\s*([\d一二三四五六七八九十]+)\s*[季期部]|season\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s*season)\s*$/);
 const season=match?seasonNumber(match[2]||match[3]||match[4]):undefined,base=season&&match?.[1].trim()?match[1].trim():value;
 // These marks identify real sequels: 銀魂', 銀魂°, 銀魂., WORKING'!!.
 // Apostrophes inside words and abbreviation dots are still cosmetic.
 const markers=(base.match(/[!?]{2,}|°|'(?![\p{L}\p{N}])|\.+(?=\s*$)/gu)||[]).join('|');
 return {key:normalizeTitle(base),season:base!==value?season:undefined,markers};
}
export function matchesTitle(name:string,names:string[],subject?:SourceSubject){
 const identity=titleIdentity(name);if(!identity.key)return false;
 return names.some(value=>{const other=titleIdentity(value);if(identity.markers!==other.markers)return false;
  if(normalizeTitle(name)===normalizeTitle(value))return true;
  return episodic(subject)&&identity.key===other.key&&(identity.season??1)===(other.season??1);
 });
}
export function sourceCatalogueIssue(roads:Road[],subject?:SourceSubject){
 const lines=roads.filter(road=>road.episodes.length);if(!subject||!lines.length)return '';
 // A single numbered EP is a valid ongoing series. A lone unnumbered HD/正片
 // entry is ambiguous for a multi-episode work and must not be picked silently.
 if(episodic(subject)&&lines.every(road=>road.episodes.length===1&&knownEpisodeNumber({name:road.episodes[0].name})===undefined))return '目录只有未编号的单片条目，可能为同名电影或合集，请手动确认';
 if(subject.eps===1&&lines.some(road=>road.episodes.length>3&&road.episodes.filter(episode=>(knownEpisodeNumber({name:episode.name})??0)>1).length>2))return '目录为多集连续剧，与当前单集作品不一致，请手动确认';
 return '';
}
