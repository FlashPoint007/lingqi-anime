import {env} from 'cloudflare:workers';
import snapshot from './rules-snapshot.json';
import {archiveRules} from './rule-subscription-server';
import {ruleCompatibility,type SubscriptionEntry} from './subscriptions';
const KEY='kazumi-active-v1',HOUR=3600000;
type Saved={value_json:string;updated_at:number;checked_at:number};
let pending:Promise<ReturnType<typeof result>>|undefined;
function clean(value:unknown):SubscriptionEntry[]{
 if(!Array.isArray(value)||!value.length||value.length>500)throw Error('规则目录无效');
 const entries=value.filter(e=>e&&typeof e.file==='string'&&/^[-\p{L}\p{N} _.()]+\.json$/u.test(e.file)&&!ruleCompatibility(e.rule));
 if(!entries.length||new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('规则目录无效');
 return entries.map(e=>({file:e.file,rule:e.rule}));
}
function result(entries:SubscriptionEntry[],updatedAt:number,checkedAt:number,storage:string,stale=false){return {entries,files:entries.map(e=>({file:e.file})),updatedAt,checkedAt,storage,stale,complete:storage!=='snapshot',managed:true};}
export async function siteRules(refresh=false){
 const db=env.DB;let saved:Saved|null=null,entries:SubscriptionEntry[]|undefined;
 if(db)try{saved=await db.prepare('SELECT value_json,updated_at,checked_at FROM site_rule_sets WHERE key=?').bind(KEY).first<Saved>();if(saved)entries=clean(JSON.parse(saved.value_json));}catch{saved=null;}
 const now=Date.now();
 if(saved&&entries&&now-saved.checked_at<(refresh?60000:HOUR))return result(entries,saved.updated_at,saved.checked_at,'d1',saved.checked_at>saved.updated_at);
 if(pending)return pending;
 pending=(async()=>{
  try{
   const fresh=clean(await archiveRules()),time=Date.now(),json=JSON.stringify(fresh);
   if(new TextEncoder().encode(json).length>1048576)throw Error('全站规则目录过大');
   if(!db)throw Error('规则数据库不可用');
   await db.prepare('INSERT INTO site_rule_sets(key,value_json,updated_at,checked_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at,checked_at=excluded.checked_at WHERE site_rule_sets.updated_at<=excluded.updated_at').bind(KEY,json,time,time).run();
   return result(fresh,time,time,'d1');
  }catch{
   if(saved&&entries&&db){const time=Date.now();try{await db.prepare('UPDATE site_rule_sets SET checked_at=? WHERE key=? AND updated_at=?').bind(time,KEY,saved.updated_at).run();}catch{}return result(entries,saved.updated_at,time,'d1',true);}
   // Persist the bundled valid rules on first use even when upstream is down.
   const fallback=clean(snapshot.entries);let storage='snapshot';
   if(db)try{await db.prepare('INSERT INTO site_rule_sets(key,value_json,updated_at,checked_at) VALUES(?,?,0,?) ON CONFLICT(key) DO NOTHING').bind(KEY,JSON.stringify(fallback),now).run();storage='d1';}catch{}
   return result(fallback,0,now,storage,true);
  }
 })();try{return await pending;}finally{pending=undefined;}
}
