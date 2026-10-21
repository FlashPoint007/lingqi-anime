'use client';
import type {WatchRecord} from '../lib/personal-data';
export default function EpisodeHistory({record,onResume}:{record:WatchRecord;onResume:(number:number)=>void}){
 const entries=Object.entries(record.progresses||{}).filter(([,p])=>p.position>0||p.completed).sort((a,b)=>Number(a[0])-Number(b[0]));
 if(!entries.length)return null;
 return <details className="episode-history"><summary>逐集进度 · {entries.length} 集</summary><div>{entries.map(([key,progress])=><button type="button" key={key} onClick={()=>onResume(Number(key))} title={new Date(progress.updatedAt).toLocaleString('zh-CN')}><b>EP {key}</b><span>{progress.completed?'已到结尾 · 重新观看':Math.floor(progress.position/60)+':'+String(Math.floor(progress.position%60)).padStart(2,'0')+' · 继续观看'}</span>{progress.duration>0&&<progress aria-label={'第 '+key+' 集进度'} value={progress.position} max={progress.duration}/>}</button>)}</div></details>;
}
