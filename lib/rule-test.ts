import {parseSearch,parseChapters,validateRule,type Rule} from './web-core';
import {sourceRequest} from './source-availability';
export type RuleTestStep={name:string;state:'running'|'passed'|'failed';message:string;raw?:string};
export type RuleTestResult={results:{name:string;url:string}[];roads:{name:string;episodes:{name:string;url:string;number?:number}[]}[];source:string};
export async function testRule(input:Rule,keyword:string,signal:AbortSignal,update:(step:RuleTestStep)=>void,request=sourceRequest):Promise<RuleTestResult>{
 const rule=validateRule(input),term=keyword.trim().slice(0,120);if(!term)throw Error('请输入测试番剧名称');let step='搜索请求';
 const report=(state:RuleTestStep['state'],message:string,raw?:unknown)=>{signal.throwIfAborted();update({name:step,state,message,...(raw!==undefined?{raw:(typeof raw==='string'?raw:JSON.stringify(raw,null,2)).slice(0,12000)}:{})});};
 try{report('running','正在请求源站…');const data=await request({rule,url:rule.searchMode==='api'?rule.baseURL:rule.searchURL.replaceAll('@keyword',encodeURIComponent(term)),operation:'search',search:true,keyword:term,refresh:true},signal);report('passed','源站已响应',data.html??data.results);
  step='结果解析';report('running','正在应用规则…');const results=(data.results||parseSearch(data.html,rule,data.url)).slice(0,40);if(!results.length)throw Error('搜索已响应，但规则没有解析出有效结果');report('passed','解析到 '+results.length+' 个结果',results);
  step='分集线路';report('running','使用第一个搜索结果检查分集：'+results[0].name);const source=results[0].url,detail=await request({rule,url:source,source,operation:'chapters',refresh:true},signal),roads=detail.roads||parseChapters(detail.html,rule,detail.url||source);if(!roads.some((road:any)=>road.episodes?.length))throw Error('没有解析到有效分集，请检查规则或更换测试关键词');report('passed','找到 '+roads.length+' 条线路；请核对搜索结果是否为目标番剧',detail.html??roads);return {results,roads,source};
 }catch(error){if(!signal.aborted)update({name:step,state:'failed',message:(error as Error).message});throw error;}
}
