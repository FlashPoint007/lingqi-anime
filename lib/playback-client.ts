export type Episode={name:string;url:string;source?:string;number?:number};
export type Road={name:string;episodes:Episode[]};
export function isCurrentPlayback(expected:{sourceUrl:string;url:string},active:{sourceUrl:string;url:string}){return expected.sourceUrl===active.sourceUrl&&expected.url===active.url;}
export function ruleForPlayback<T extends {name:string;baseURL:string;enabled?:boolean}>(rules:T[],url:string,preferredName?:string){
 const origin=new URL(url).origin;const matching=rules.filter(rule=>{try{return rule.enabled!==false&&new URL(rule.baseURL).origin===origin;}catch{return false;}});
 return matching.find(rule=>rule.name===preferredName)||matching[0];
}

export function episodeNumber(episode:Episode,index:number){
 if(Number.isFinite(episode.number))return episode.number!;
 const name=episode.name.normalize('NFKC').trim();
 const match=name.match(/^(?:第\s*)?(\d+(?:\.\d+)?)\s*(?:[集话話回]|$)/)||name.match(/^(?:EP(?:ISODE)?|Chapter)\s*[.:-]?\s*(\d+(?:\.\d+)?)(?=$|\s|[:：-])/i);
 return match?Number(match[1]):index+1;
}
type EpisodeIdentity={subjectId:number;number?:number;sourceUrl?:string};
export function resumeEpisodePosition(current:EpisodeIdentity|undefined,target:EpisodeIdentity,position:number){
 const same=current?.subjectId===target.subjectId&&(!!target.sourceUrl&&target.sourceUrl===current?.sourceUrl||Number.isFinite(target.number)&&target.number===current?.number);
 return same&&Number.isFinite(position)&&position>=0?position:0;
}
export function episodeAtNumber(episodes:Episode[],number:number){
 return episodes.find((e,i)=>episodeNumber(e,i)===number);
}
export function playbackUrls(player:{url:string;mediaUrl?:string;preferDirect?:boolean}){
 const direct=Boolean(player.preferDirect&&player.mediaUrl);
 return {url:direct?player.mediaUrl!:player.url,fallbackUrl:direct?player.url:player.mediaUrl};
}
