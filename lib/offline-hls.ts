export type OfflinePlaylist={text:string;references:string[];variant?:string};
export function parseOfflinePlaylist(text:string,base:string,local:(url:string)=>string):OfflinePlaylist{
 if(text.length>4*1024*1024||!text.trimStart().startsWith('#EXTM3U'))throw new Error('HLS 播放列表无效或过大');
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),refs=new Set<string>();
 if(lines.length>20000)throw new Error('HLS 播放列表过大');
 const url=(value:string)=>{const address=new URL(value,base);if(address.protocol!=='https:'&&address.origin!==new URL(base).origin)throw new Error('HLS 引用了不安全的地址');if(address.username||address.password||!['https:','http:'].includes(address.protocol))throw new Error('HLS 地址无效');return address.href;};
 if(lines.some(line=>line.startsWith('#EXT-X-STREAM-INF:'))){
  const variants: {url:string;bandwidth:number}[]=[];
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){if(/[:,]AUDIO=/.test(lines[i]))throw new Error('此 HLS 使用独立音轨，暂不支持离线，请选择其他线路');const next=lines[i+1]?.trim();if(!next||next.startsWith('#'))throw new Error('HLS 清晰度列表无效');variants.push({url:url(next),bandwidth:Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1])||0});}
  if(!variants.length||variants.length>32)throw new Error('HLS 清晰度列表无效');variants.sort((a,b)=>b.bandwidth-a.bandwidth);return {text:'',references:[],variant:variants[0].url};
 }
 if(!lines.some(line=>line.trim()==='#EXT-X-ENDLIST'))throw new Error('直播或尚未结束的 HLS 暂不支持离线下载');
 if(lines.some(line=>line.startsWith('#EXT-X-KEY:')&&!/(?:^|:)METHOD=NONE(?:,|$)/.test(line))||lines.some(line=>line.startsWith('#EXT-X-SESSION-KEY:')))throw new Error('加密或受保护的 HLS 暂不支持离线下载，请选择其他线路');
 const replace=(value:string)=>{const address=url(value);refs.add(address);if(refs.size>4096)throw new Error('HLS 分片超过 4096 个，请选择其他线路');return local(address);};
 const output=lines.map(raw=>{let line=raw.trim();if(line&&!line.startsWith('#'))return replace(line);line=line.replace(/URI="([^"]+)"/g,(_,value)=>'URI="'+replace(value)+'"');return line;});
 if(!refs.size)throw new Error('HLS 没有视频分片');return {text:output.join('\n'),references:[...refs]};
}
