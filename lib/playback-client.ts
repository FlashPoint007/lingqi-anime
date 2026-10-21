export type Episode={name:string;url:string;source?:string;number?:number};
export type Road={name:string;episodes:Episode[]};
export function isCurrentPlayback(expected:{sourceUrl:string;url:string},active:{sourceUrl:string;url:string}){return expected.sourceUrl===active.sourceUrl&&expected.url===active.url;}
export function ruleForPlayback<T extends {name:string;baseURL:string;enabled?:boolean}>(rules:T[],url:string,preferredName?:string){
 const origin=new URL(url).origin;const matching=rules.filter(rule=>{try{return rule.enabled!==false&&new URL(rule.baseURL).origin===origin;}catch{return false;}});
 return matching.find(rule=>rule.name===preferredName)||matching[0];
}

export function knownEpisodeNumber(episode:Pick<Episode,'name'|'number'>){
 if(Number.isFinite(episode.number))return episode.number!;
 const name=episode.name.normalize('NFKC').trim();
 const match=name.match(/^(?:第\s*)?(\d+(?:\.\d+)?)\s*(?:[集话話回]|$)/)||name.match(/^(?:EP(?:ISODE)?|Chapter)\s*[.:-]?\s*(\d+(?:\.\d+)?)(?=$|\s|[:：-])/i);
 return match?Number(match[1]):undefined;
}
export function episodeNumber(episode:Episode,index:number){
 return knownEpisodeNumber(episode)??index+1;
}
type EpisodeIdentity={subjectId:number;number?:number;sourceUrl?:string};
export function resumeEpisodePosition(current:EpisodeIdentity|undefined,target:EpisodeIdentity,position:number){
 const same=current?.subjectId===target.subjectId&&(!!target.sourceUrl&&target.sourceUrl===current?.sourceUrl||Number.isFinite(target.number)&&target.number===current?.number);
 return same&&Number.isFinite(position)&&position>=0?position:0;
}
export function episodeAtNumber(episodes:Episode[],number:number){
 return episodes.find((e,i)=>episodeNumber(e,i)===number);
}
// Some second seasons retain global Bangumi numbering (29..38) while sources
// restart at 1. Convert only an unambiguous, explicitly numbered local season.
export function alignEpisodeNumbers(roads:Road[],metadataNumbers:number[]){
 const known=[...new Set(metadataNumbers)].sort((a,b)=>a-b),first=known[0];
 if(!first||first<=1||known.length<2||known.some((n,i)=>!Number.isInteger(n)||n!==first+i))return roads;
 let changed=false;
 const result=roads.map(road=>{
  const numbers=road.episodes.map(knownEpisodeNumber);
  if(!numbers.length||!numbers.includes(1)||numbers.some(n=>n===undefined||!Number.isInteger(n)||n<1||n>known.length)||new Set(numbers).size!==numbers.length)return road;
  changed=true;return {...road,episodes:road.episodes.map((episode,i)=>({...episode,number:known[numbers[i]!-1]}))};
 });
 return changed?result:roads;
}
export function visibleEpisodes(episodes:Episode[],query='',descending=false){
 const term=query.normalize('NFKC').trim().toLowerCase(),numeric=/^\d+(?:\.\d+)?$/.test(term);
 return episodes.map((episode,index)=>({episode,number:episodeNumber(episode,index),index}))
  .filter(item=>!term||(numeric?item.number===Number(term):item.episode.name.normalize('NFKC').toLowerCase().includes(term)))
  .sort((a,b)=>(descending?b.number-a.number:a.number-b.number)||a.index-b.index);
}
export type EpisodeTarget={number:number;episode?:Episode};
export function episodeNeighbors(episodes:Episode[],sourceUrl:string,current?:number,known:number[]=[],total?:number):{previous?:EpisodeTarget;next?:EpisodeTarget}{
 const index=episodes.findIndex(episode=>episode.url===sourceUrl),number=Number.isFinite(current)?current:index>=0?episodeNumber(episodes[index],index):undefined;
 if(number===undefined)return {};
 const trusted=index>=0&&Number.isFinite(current)&&episodeNumber(episodes[index],index)!==current?[]:episodes;
 const numbers=new Set([...trusted.map(episodeNumber),...known].filter(n=>Number.isFinite(n)&&n>=0));
 if(Number.isInteger(number)&&number>=1&&Number.isInteger(total)){
  if(number>1&&number<=total!)numbers.add(number-1);if(number<total!)numbers.add(number+1);
 }
 const sorted=[...numbers].sort((a,b)=>a-b),before=sorted.filter(n=>n<number).at(-1),after=sorted.find(n=>n>number);
 const target=(n:number|undefined)=>n===undefined?undefined:{number:n,episode:episodeAtNumber(trusted,n)};
 return {previous:target(before),next:target(after)};
}
export function playbackUrls(player:{url:string;mediaUrl?:string;preferDirect?:boolean}){
 const direct=Boolean(player.preferDirect&&player.mediaUrl);
 return {url:direct?player.mediaUrl!:player.url,fallbackUrl:direct?player.url:player.mediaUrl};
}

export function episodeLabel(name:string,number?:number){
 const normalized=name.normalize('NFKC').trim();
 if(number===undefined)return normalized;
 const prefix='第 '+number+' 集';
 if(knownEpisodeNumber({name:normalized})!==number)return normalized?prefix+' · '+normalized:prefix;
 const rest=normalized.replace(/^(?:(?:第\s*)?\d+(?:\.\d+)?\s*(?:[集话話回]|$)|(?:EP(?:ISODE)?|Chapter)\s*[.:-]?\s*\d+(?:\.\d+)?(?=$|\s|[:：-]))/i,'').replace(/^[\s·:：-]+/,'');
 return rest?prefix+' · '+rest:prefix;
}
