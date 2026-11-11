import type {Rule} from './web-core';
import type {SourceAvailability} from './source-availability';

export type SourceSample={id:string;at:number;ok:boolean;ms?:number};
export type SourceHealth=Record<string,SourceSample[]>;
export type SourcePerformance={attempts:number;successes:number;rate:number;startupMs?:number;score:number};
const MAX_AGE=30*86400000,MAX_SAMPLES=30;
const ignored=new Set(['enabled','userDisabled','subscription','subscriptionFile','repositorySource','repositoryFile']);
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
// Keep URLs and browsing details out of the stored statistics. A new rule
// configuration gets a fresh identity; toggling the rule does not erase history.
export function sourceHealthKey(rule:Rule){
 const input=stable(Object.fromEntries(Object.entries(rule).filter(([key])=>!ignored.has(key))));let hash=2166136261;
 for(let i=0;i<input.length;i++){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return 'r'+(hash>>>0).toString(36);
}
export function cleanSourceHealth(value:unknown,now=Date.now()):SourceHealth{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const result:SourceHealth={};
 for(const [key,rows] of Object.entries(value).slice(-200)){
  if(!/^r[a-z0-9]{1,12}$/.test(key)||!Array.isArray(rows))continue;
  const samples=new Map<string,SourceSample>();
  for(const row of rows.slice(-100)){
   if(!row||typeof row.id!=='string'||row.id.length>80||!Number.isFinite(row.at)||row.at>now||now-row.at>MAX_AGE||typeof row.ok!=='boolean')continue;
   samples.set(row.id,{id:row.id,at:row.at,ok:row.ok,...(Number.isFinite(row.ms)&&row.ms>=0&&row.ms<=180000?{ms:row.ms}:{})});
  }
  const recent=[...samples.values()].sort((a,b)=>a.at-b.at).slice(-MAX_SAMPLES);if(recent.length)result[key]=recent;
 }
 return result;
}
export function sourcePerformance(health:SourceHealth,rule:Rule,now=Date.now()):SourcePerformance{
 const samples=(health[sourceHealthKey(rule)]||[]).filter(row=>row.at<=now&&now-row.at<=MAX_AGE),success=samples.filter(row=>row.ok),times=success.flatMap(row=>row.ms===undefined?[]:[row.ms]);
 const startupMs=times.length?times.reduce((sum,ms)=>sum+ms,0)/times.length:undefined;
 // Two prior successes and one failure keep sparse samples from making absolute
// claims. Untried sources rank above failed sources, and old failures expire.
 const score=(success.length+2)/(samples.length+3)-(startupMs===undefined?0:Math.min(startupMs,60000)/60000*.12);
 return {attempts:samples.length,successes:success.length,rate:samples.length?success.length/samples.length:0,startupMs,score};
}
export function rankSources(rules:Rule[],health:SourceHealth,checks:Record<string,SourceAvailability>={},preferredName='',now=Date.now()){
 const group=(rule:Rule)=>{const check=checks[rule.name];return check?.state==='episode-error'||check?.state==='error'?2:check?.state==='not-found'?3:check?.roads?.some(line=>line.episodes.length)||check?.state==='found'||check?.state==='playing'?0:1;};
 const ranked=rules.map((rule,index)=>({rule,index,performance:sourcePerformance(health,rule,now)}));
 return ranked.sort((a,b)=>Number(b.rule.name===preferredName)-Number(a.rule.name===preferredName)||group(a.rule)-group(b.rule)||b.performance.score-a.performance.score||a.index-b.index);
}
export function sourcePerformanceLabel(performance:SourcePerformance){
 if(!performance.attempts)return '本机暂无播放样本';
 return '本机近期 '+performance.successes+'/'+performance.attempts+' 次成功'+(performance.startupMs===undefined?'':' · 起播 '+(performance.startupMs/1000).toFixed(1)+' 秒');
}
type Context={owner:string;ready:boolean;private:boolean};
export type SourceAttempt={key:string;id:string;at:number;started:number;epoch:number;generation:number;sourceUrl:string;url?:string;waiting?:boolean;resolvedAt?:number;done?:boolean;failed?:boolean};
export function createSourceHealthTracker(read:(key:string)=>string|null,write:(key:string,value:string)=>unknown,onChange:(owner:string,data:SourceHealth)=>void,wall=Date.now,clock=()=>performance.now()){
 let context:Context={owner:'anonymous',ready:false,private:false},epoch=0,current:SourceAttempt|undefined,sequence=0;
 const storageKey=()=> 'kw-source-health:v1:'+context.owner;
 const readData=()=>{try{return cleanSourceHealth(JSON.parse(read(storageKey())||'{}'),wall());}catch{return {};}};
 const valid=(attempt:SourceAttempt|undefined):attempt is SourceAttempt=>!!attempt&&attempt.epoch===epoch&&context.ready&&!context.private;
 const report=(attempt:SourceAttempt|undefined,ok:boolean)=>{
  if(!valid(attempt)||attempt.failed||ok&&attempt.done||!ok&&typeof navigator!=='undefined'&&navigator.onLine===false)return;
  if(!ok)attempt.failed=true;attempt.done=true;
  const elapsed=clock()-attempt.started,data=readData(),samples=data[attempt.key]||[];
  const sample:SourceSample={id:attempt.id,at:attempt.at,ok,...(!attempt.waiting&&elapsed>=0&&elapsed<=180000?{ms:elapsed}:{})};
  data[attempt.key]=[...samples.filter(row=>row.id!==sample.id),sample];const cleaned=cleanSourceHealth(data,wall());
  write(storageKey(),JSON.stringify(cleaned));onChange(context.owner,cleaned);
 };
 return {
  context(next:Context){if(next.owner!==context.owner||next.ready!==context.ready||next.private!==context.private){epoch++;current=undefined;}context=next;},
  load(){return readData();},
  cancel(){epoch++;current=undefined;},
  begin(rule:Rule,generation:number,sourceUrl:string){if(!context.ready||context.private)return undefined;return {key:sourceHealthKey(rule),id:wall().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2,10),at:wall(),started:clock(),epoch,generation,sourceUrl} as SourceAttempt;},
  resolve(attempt:SourceAttempt|undefined,ok:boolean){if(!ok)report(attempt,false);else if(valid(attempt))attempt.resolvedAt=clock();},
  activate(attempt:SourceAttempt|undefined,url:string){current=valid(attempt)?{...attempt,url,started:attempt.started+(attempt.resolvedAt===undefined?0:clock()-attempt.resolvedAt)}:undefined;},
  playback(generation:number|undefined,sourceUrl:string,url:string,ok:boolean){if(current&&current.generation===generation&&current.sourceUrl===sourceUrl&&current.url===url)report(current,ok);},
  wait(generation:number|undefined,sourceUrl:string,url:string){if(current&&current.generation===generation&&current.sourceUrl===sourceUrl&&current.url===url&&!current.done)current.waiting=true;},
 };
}
