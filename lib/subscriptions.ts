import snapshot from './rules-snapshot.json';
import {validateRule,type Rule} from './web-core';
export const RULE_REPOSITORY='Predidit/KazumiRules';
export type SubscriptionEntry={file:string;rule:Rule;sha?:string};
export function ruleCompatibility(r:Rule):string {
 if(!r.baseURL.startsWith('https://'))return 'HTTP 源站：浏览器适配不可用';
 if(r.deprecated)return '上游已弃用';
 try{validateRule(r);}catch{return '规则格式无效';}
 return '';
}
export function subscriptionRule(entry:SubscriptionEntry):Rule {
 const r=entry.rule;return {...r,subscription:RULE_REPOSITORY,subscriptionFile:entry.file,enabled:!ruleCompatibility(r)};
}
const preferred=['MXdm','akianime','moonci','aafun'];
function priority(r:Rule){const index=preferred.indexOf(r.name);return index<0?preferred.length:index;}
export const initialRules=snapshot.entries.filter(e=>!ruleCompatibility(e.rule as Rule)).map(e=>subscriptionRule(e as SubscriptionEntry)).sort((a,b)=>priority(a)-priority(b));
// Managed rules follow the active upstream index; temporary outages are not deletions.
export function mergeSubscribed(current:Rule[],incoming:SubscriptionEntry[],activeFiles?:string[]):Rule[] {
 const allowed=activeFiles?new Set(activeFiles):undefined;
 const result=current.filter(r=>!r.subscription||(r.subscription===RULE_REPOSITORY&&!ruleCompatibility(r)&&(!allowed||allowed.has(String(r.subscriptionFile)))));
 for(const entry of incoming){
  if(ruleCompatibility(entry.rule))continue;
  const i=result.findIndex(r=>r.subscription===RULE_REPOSITORY&&r.subscriptionFile===entry.file);
  if(i<0){if(!result.some(r=>!r.subscription&&r.name===entry.rule.name))result.push(subscriptionRule(entry));}
  else {const previous=result[i];result[i]={...subscriptionRule(entry),userDisabled:previous.userDisabled===true,enabled:previous.userDisabled!==true};}
 }
 return result.sort((a,b)=>priority(a)-priority(b));
}
