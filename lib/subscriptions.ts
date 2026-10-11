import snapshot from './rules-snapshot.json';
import type {Rule} from './web-core';
export const RULE_REPOSITORY='Predidit/KazumiRules';
export type SubscriptionEntry={file:string;rule:Rule;sha?:string};
export function ruleCompatibility(r:Rule):string {
 if(!r.baseURL.startsWith('https://'))return 'HTTP 源站：浏览器适配不可用';
 if(r.deprecated)return '上游已弃用';
 return '';
}
export function subscriptionRule(entry:SubscriptionEntry):Rule {
 const r=entry.rule;return {...r,subscription:RULE_REPOSITORY,subscriptionFile:entry.file,enabled:!ruleCompatibility(r)};
}
export const initialRules=snapshot.entries.map(e=>subscriptionRule(e as SubscriptionEntry));
// Identify managed entries by file, not display name. Preserve user switches and edits.
export function mergeSubscribed(current:Rule[],incoming:SubscriptionEntry[]):Rule[] {
 const result=[...current];
 for(const entry of incoming){
  const i=result.findIndex(r=>r.subscription===RULE_REPOSITORY&&r.subscriptionFile===entry.file);
  if(i<0){if(!result.some(r=>!r.subscription&&r.name===entry.rule.name))result.push(subscriptionRule(entry));}
  else {const previous=result[i];result[i]={...subscriptionRule(entry),enabled:ruleCompatibility(entry.rule)?false:previous.enabled!==false};}
 }
 return result;
}
