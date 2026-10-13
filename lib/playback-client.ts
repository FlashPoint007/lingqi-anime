export type Episode={name:string;url:string;source?:string;number?:number};
export type Road={name:string;episodes:Episode[]};

export function episodeNumber(episode:Episode,index:number){
 if(Number.isFinite(episode.number))return episode.number!;
 const match=episode.name.match(/(?:第\s*)?(\d+(?:\.\d+)?)(?:\s*[集话]|\b)/);
 return match?Number(match[1]):index+1;
}
export function episodeAtNumber(episodes:Episode[],number:number){
 return episodes.find((e,i)=>episodeNumber(e,i)===number);
}
export function playbackUrls(player:{url:string;mediaUrl?:string;preferDirect?:boolean}){
 const direct=Boolean(player.preferDirect&&player.mediaUrl);
 return {url:direct?player.mediaUrl!:player.url,fallbackUrl:direct?player.url:player.mediaUrl};
}
