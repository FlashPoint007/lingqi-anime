import {validateRule,type Rule} from './web-core';

export const OFFICIAL_RULE_ROOT='https://raw.githubusercontent.com/Predidit/KazumiRules/main/';
export const REPOSITORY_STORAGE_KEY='kw-rule-repository';
export type RepositoryItem={name:string;file:string;version:string};

// Restrict the server-side reader to GitHub's public raw-file service. Never
// accept arbitrary hosts, proxy prefixes, credentials or redirect destinations.
export function normalizeRuleRepository(input:string):string {
 const value=input.trim();if(!value)return OFFICIAL_RULE_ROOT;
 if(value.length>1024||value.includes('\\'))throw Error('规则仓库地址无效');
 let url:URL;try{url=new URL(value);}catch{throw Error('请输入完整的 HTTPS GitHub Raw 目录地址');}
 if(url.protocol!=='https:'||url.hostname!=='raw.githubusercontent.com'||url.username||url.password||url.port||url.search||url.hash)throw Error('请使用不含账号、参数的 HTTPS GitHub Raw 地址');
 let parts:string[];try{parts=url.pathname.split('/').slice(1).map(decodeURIComponent);}catch{throw Error('规则仓库地址编码无效');}
 while(parts.at(-1)==='')parts.pop();
 if(parts.at(-1)?.toLowerCase()==='index.json')parts.pop();
 else if(!url.pathname.endsWith('/')&&parts.at(-1)?.includes('.'))throw Error('请输入目录地址或 index.json 地址');
 if(parts.length<3||!/^[-a-z0-9]+$/i.test(parts[0])||!/^[-a-z0-9_.]+$/i.test(parts[1])||parts.some(p=>!p||p==='.'||p==='..'||/[\\/\u0000-\u0020?#]/u.test(p)))throw Error('地址需包含仓库所有者、仓库名和分支，且不能包含特殊路径');
 const normalized=url.origin+'/'+parts.map(encodeURIComponent).join('/')+'/';
 if(normalized.length>1024)throw Error('规则仓库地址过长');
 return normalized;
}

export function repositoryCatalog(value:unknown):RepositoryItem[] {
 if(!Array.isArray(value)||!value.length||value.length>500)throw Error('规则索引为空或超过 500 条');
 const seen=new Set<string>();
 return value.map(item=>{
  const name=item?.name;
  if(typeof name!=='string'||!name||name.length>100||name.trim()!==name||!/^[-\p{L}\p{N} _.()]+$/u.test(name)||name.toLowerCase()==='index'||seen.has(name))throw Error('规则索引包含无效或重复名称');
  seen.add(name);
  return {name,file:name+'.json',version:typeof item.version==='string'||typeof item.version==='number'?String(item.version).slice(0,60):''};
 });
}

export function repositoryRuleState(rules:Rule[],root:string,item:RepositoryItem){
 const previous=rules.find(rule=>rule.name===item.name);
 return !previous?'new':!previous.subscription&&previous.repositorySource===root&&previous.repositoryFile===item.file?'installed':'conflict';
}

export function installRepositoryRule(current:Rule[],root:string,file:string,input:unknown):Rule[] {
 root=normalizeRuleRepository(root);const rule=validateRule(input),item={name:rule.name,file,version:rule.version||''};
 if(file!==rule.name+'.json'||rule.deprecated||repositoryRuleState(current,root,item)==='conflict')return current;
 const previous=current.find(r=>r.name===rule.name);
 // A remote file cannot claim to be a managed global subscription or redirect
 // a later update to another repository. User toggles survive explicit updates.
 const {subscription,subscriptionFile,repositorySource,repositoryFile,userDisabled,enabled,...body}=rule;
 const installed:Rule={...body,repositorySource:root,repositoryFile:file,userDisabled:previous?.userDisabled===true,enabled:previous?previous.enabled!==false:true};
 return previous?current.map(r=>r.name===rule.name?installed:r):[...current,installed];
}
