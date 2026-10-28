import {env,waitUntil} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {readRequestText,RequestLimitError} from './request-guard';

const COOKIE='__Host-lingqi-session',LIFETIME=7*86400,encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
type Account={id:string;email:string;password_hash:string;email_verified_at:number|null};
type ActionToken={token_hash:string;email:string;purpose:string;user_id:string|null;credential_hash:string|null};
type MailConfig={key:string;from:string;origin:string};
const settings=()=>env as unknown as {LINGQI_AUTH_SECRET?:string;RESEND_API_KEY?:string;LINGQI_MAIL_FROM?:string;LINGQI_SITE_URL?:string};
function database(){if(!env.DB)throw Error('AUTH_UNAVAILABLE');return env.DB;}
function secret(){const key=settings().LINGQI_AUTH_SECRET;if(!key||key.length<32)throw Error('AUTH_UNAVAILABLE');return key;}
function mailConfig():MailConfig|undefined{
 const {RESEND_API_KEY:key,LINGQI_MAIL_FROM:from,LINGQI_SITE_URL:site}=settings();
 if(!key||!from||!site||/[\r\n]/.test(from)||from.length>320||!/@[^\s<>]+\.[^\s<>]+>?$/.test(from))return;
 try{const u=new URL(site);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return;return {key,from,origin:u.origin};}catch{return;}
}
async function passwordHash(password:string,salt:string){
 const pepper=await crypto.subtle.importKey('raw',encoder.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const input=await crypto.subtle.sign('HMAC',pepper,encoder.encode('lingqi-password-v1:'+password));
 const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:encoder.encode(salt)},key,256));
}
async function storedPassword(password:string){const salt=random();return 'pbkdf2-pepper-v1$'+salt+'$'+await passwordHash(password,salt);}
function token(req:Request){const value=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:undefined;}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export async function getSiteUser(req:Request){
 const raw=token(req);
 if(req.headers.get('cookie')?.split(';').some(x=>x.trim().startsWith(COOKIE+'='))&&!raw)return null;
 if(raw){
  const row=await database().prepare('SELECT a.id,a.email,a.email_verified_at FROM email_sessions s JOIN email_accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(raw),Date.now()).first<{id:string;email:string;email_verified_at:number|null}>();
  if(row)return {userId:row.id,displayName:row.email,email:row.email,emailVerified:row.email_verified_at!==null,provider:'email' as const};
  return null;
 }
 const legacy=await getChatGPTUser();return legacy?{...legacy,provider:'chatgpt' as const}:null;
}
const response=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Cookie',...(cookie?{'Set-Cookie':cookie}:{})}});
const sessionCookie=(value:string,seconds=LIFETIME)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
const mailUnavailable=()=>response({error:'邮箱服务尚未就绪，请稍后再试；已有账号仍可登录',code:'MAIL_UNAVAILABLE'},503);
const invalidLink=()=>response({error:'链接已失效、已使用或不完整，请重新申请邮件',code:'INVALID_LINK'},400);
const accountQuery='SELECT id,email,password_hash,email_verified_at FROM email_accounts WHERE email=?';
async function bucket(key:string,windowMs:number,limit:number,now=Date.now()){
 const start=Math.floor(now/windowMs)*windowMs;
 const result=await database().prepare('INSERT INTO email_attempts(key,expires_at,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key+':'+start,start+windowMs).first<{hits:number}>();
 return !!result&&result.hits<=limit;
}
async function reserveMail(email:string){
 reclaimAuthData();
 const now=Date.now(),key=await digest(email),db=database();
 const reserved=await db.prepare('INSERT INTO email_attempts(key,expires_at,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at,hits=1 WHERE email_attempts.expires_at<=? RETURNING hits').bind('mail-cooldown:'+key,now+60000,now).first();
 if(!reserved||!await bucket('mail-email:'+key,3600000,5,now))return response({error:'邮件请求过于频繁，请至少一分钟后重试',code:'MAIL_RATE_LIMIT'},429);
 if(!await bucket('mail-global',86400000,200,now))return response({error:'今日邮件服务繁忙，请稍后重试',code:'MAIL_RATE_LIMIT'},429);
}
async function cleanup(){
 const db=database(),now=Date.now();await db.batch([
  db.prepare('DELETE FROM email_attempts WHERE key IN (SELECT key FROM email_attempts WHERE expires_at<=? LIMIT 500)').bind(now),
  db.prepare('DELETE FROM email_action_tokens WHERE token_hash IN (SELECT token_hash FROM email_action_tokens WHERE expires_at<=? LIMIT 500)').bind(now),
 ]);
}
let cleaning=false;
function reclaimAuthData(){
 if(cleaning)return;cleaning=true;
 background(cleanup().finally(()=>{cleaning=false;}),'lingqi_auth_cleanup_failed');
}
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function sendMail(config:MailConfig,email:string,subject:string,message:string,link?:string,id=random()){
 const body={from:config.from,to:[email],subject:'零柒番剧 · '+subject,text:message+(link?'\n\n'+link:''),html:'<div lang="zh-CN" style="font-family:system-ui,sans-serif;line-height:1.8;color:#354944;max-width:540px;margin:24px auto"><h2>零柒番剧</h2><p>'+escapeHtml(message).replace(/\n/g,'<br>')+'</p>'+(link?'<p><a href="'+escapeHtml(link)+'">'+escapeHtml(subject)+'</a></p>':'')+'<p style="color:#727970;font-size:12px">如果不是你本人发起，请忽略这封邮件。请勿将链接转发给任何人。</p></div>'};
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Idempotency-Key':'lingqi-mail/'+id},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'});
 // Never log provider bodies, addresses, credentials, or action links.
 void res.body?.cancel().catch(()=>{});if(!res.ok)throw Error('MAIL_DELIVERY_FAILED');
}
function background(task:Promise<unknown>,event='lingqi_mail_delivery_failed'){
 const guarded=task.catch(()=>{console.error(event);});
 if(typeof waitUntil==='function'){waitUntil(guarded);return;}return guarded;
}
async function requestMail(action:string,email:string,config:MailConfig,req:Request){
 const db=database();let user:Account|null;
 if(action==='request-verification'){
  const owner=await getSiteUser(req);if(!owner||owner.provider!=='email')return response({error:'请先使用邮箱账号登录'},401);
  email=owner.email;user=await db.prepare(accountQuery).bind(email).first<Account>();
  if(user&&user.email_verified_at!==null)return response({ok:true,message:'邮箱已经验证'});
 }else user=await db.prepare(accountQuery).bind(email).first<Account>();
 const limited=await reserveMail(email);if(limited)return limited;
 const purpose=action==='register'?'register':action==='forgot-password'?'reset':'verify';
 const raw=random(),hash=await digest(raw),now=Date.now(),expires=now+(purpose==='reset'?1800000:86400000);
 const issue=action==='register'?!user:!!user;
 // Execute the same bounded SQL path for unknown and known reset addresses; delivery is detached.
 await db.prepare('INSERT INTO email_action_tokens(token_hash,email,purpose,user_id,credential_hash,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE ?').bind(hash,email,purpose,user?.id??null,user?.password_hash??null,now,expires,issue?1:0).run();
 // A registration link never replaces an existing account or its password.
 if(action==='register'&&user){
  await background(sendMail(config,email,'账号提示','此邮箱已经注册。你可以回到零柒番剧登录，或使用“忘记密码”找回账号。',config.origin));
 }else if(user||action==='register'){
  const link=config.origin+'/account#action='+purpose+'&token='+raw;
  const title=purpose==='register'?'验证邮箱并完成注册':purpose==='reset'?'重置密码':'验证邮箱';
  const message=purpose==='register'?'请打开链接验证邮箱，并设置账号密码。链接在 24 小时内有效。':purpose==='reset'?'你申请了重置密码。链接在 30 分钟内有效，重置后所有设备需要重新登录。':'请打开链接确认验证邮箱。链接在 24 小时内有效，原有记录保持不变。';
  const deliver=sendMail(config,email,title,message,link,hash).catch(async()=>{await db.prepare('DELETE FROM email_action_tokens WHERE token_hash=? AND used_at IS NULL').bind(hash).run();throw Error('MAIL_DELIVERY_FAILED');});
  await background(deliver);
 }
 return response({ok:true,message:action==='register'?'如果此邮箱可用于注册，你将收到验证邮件；已有账号请直接登录或找回密码。':'如果此邮箱符合条件，你将收到邮件。请检查收件箱和垃圾邮件，至少一分钟后再试。'});
}
async function finishMail(body:Record<string,unknown>){
 const action=body.action,purpose=action==='complete-registration'?'register':action==='reset-password'?'reset':'verify',raw=body.token;
 if(typeof raw!=='string'||!/^([a-f0-9]{64})$/.test(raw))return invalidLink();
 const db=database(),hash=await digest(raw),now=Date.now();
 const row=await db.prepare('SELECT token_hash,email,purpose,user_id,credential_hash FROM email_action_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').bind(hash,purpose,now).first<ActionToken>();
 if(!row)return invalidLink();
 const claim=random(),isPassword=purpose!=='verify';
 const password=body.password;
 if(isPassword&&(typeof password!=='string'||password.length<12||password.length>128))return response({error:'密码长度需为 12 至 128 个字符'},400);
 const credential=isPassword?await storedPassword(password as string):null;
 const userId=row.user_id??'email:'+crypto.randomUUID();
 // All changes use one unique claim in a D1 transaction. Concurrent clicks can win only once.
 const claimSql=purpose==='register'?
  'UPDATE email_action_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND NOT EXISTS(SELECT 1 FROM email_accounts WHERE email=email_action_tokens.email) RETURNING token_hash':
  'UPDATE email_action_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM email_accounts WHERE id=email_action_tokens.user_id AND password_hash=email_action_tokens.credential_hash) RETURNING token_hash';
 const proof='SELECT 1 FROM email_action_tokens WHERE token_hash=? AND claim_id=?';
 const statements=[db.prepare(claimSql).bind(now,claim,hash,Date.now())];
 if(purpose==='register')statements.push(db.prepare('INSERT INTO email_accounts(id,email,password_hash,created_at,email_verified_at) SELECT ?,?,?,?,? WHERE EXISTS('+proof+') ON CONFLICT(email) DO NOTHING RETURNING id').bind(userId,row.email,credential,now,now,hash,claim));
 else if(purpose==='reset')statements.push(db.prepare('UPDATE email_accounts SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND EXISTS('+proof+') RETURNING id').bind(credential,now,userId,hash,claim));
 else statements.push(db.prepare('UPDATE email_accounts SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND EXISTS('+proof+') RETURNING id').bind(now,userId,hash,claim));
 if(purpose==='reset')statements.push(db.prepare('DELETE FROM email_sessions WHERE user_id=? AND EXISTS('+proof+')').bind(userId,hash,claim));
 statements.push(db.prepare('DELETE FROM email_action_tokens WHERE email=? AND token_hash<>? AND (?=\'reset\' OR purpose=?) AND EXISTS('+proof+')').bind(row.email,hash,purpose,purpose,hash,claim));
 const result=await db.batch(statements);
 if(!result[0].results.length||!result[1].results.length)return invalidLink();
 if(purpose==='reset'){
  const config=mailConfig();if(config)background(sendMail(config,row.email,'密码已重置','你的密码已重置，所有旧登录会话和旧重置链接已失效。如果不是你本人操作，请立即通过“忘记密码”重新找回账号。'));
 }
 return response({ok:true,message:purpose==='register'?'邮箱已验证，注册完成。请返回首页使用邮箱和密码登录。':purpose==='reset'?'密码已重置，所有设备已退出登录。请返回首页重新登录。':'邮箱验证成功。可返回网站继续使用。',emailVerified:true});
}
let working=0;
export async function emailAuthResponse(req:Request){
 if(req.method==='GET')return response({mailConfigured:!!mailConfig()});
 if(req.method!=='POST')return response({error:'请求方法不支持'},405);
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'跨站请求被拒绝'},403);
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response({error:'请使用 JSON 请求'},415);
 if(working>=4)return response({error:'账号请求较多，请稍后再试'},429);
 working++;
 try{
  const body=JSON.parse(await readRequestText(req,4096));
  if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'账号请求格式不正确'},400);
  if(body.action==='logout'){
   const raw=token(req);if(raw)await database().prepare('DELETE FROM email_sessions WHERE token_hash=?').bind(await digest(raw)).run();
   return response({ok:true},200,sessionCookie('signed-out'));
  }
  if(!['login','register','forgot-password','request-verification','complete-registration','reset-password','verify-email'].includes(body.action))return response({error:'无效账号操作'},400);
  secret();
  if(['complete-registration','reset-password','verify-email'].includes(body.action))return await finishMail(body);
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(body.action!=='request-verification'&&(email.length>254||!/^\S+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)))return response({error:'请输入有效邮箱地址'},400);
  if(body.action!=='login'){
   const config=mailConfig();if(!config)return mailUnavailable();return await requestMail(body.action,email,config,req);
  }
  const password=body.password;
  if(typeof password!=='string'||password.length<12||password.length>128)return response({error:'密码长度需为 12 至 128 个字符'},400);
  // Reclaim expired buckets on failed and quota-rejected attempts too. A success-only
  // cleanup lets unauthenticated traffic accumulate obsolete rows indefinitely.
  reclaimAuthData();
  if(!await bucket('email-auth:'+await digest(email),900000,10))return response({error:'该账号尝试过于频繁，请 15 分钟后重试'},429);
  const user=await database().prepare(accountQuery).bind(email).first<Account>(),parts=user?.password_hash.split('$')||[];
  const actual=await passwordHash(password,parts[1]||'unregistered-email-dummy-salt');
  if(!user||parts[0]!=='pbkdf2-pepper-v1'||!equal(actual,parts[2]||''))return response({error:'邮箱或密码不正确'},401);
  const raw=random(),hash=await digest(raw),previous=token(req),now=Date.now(),db=database();
  const inserted=await db.prepare('INSERT INTO email_sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM email_accounts WHERE id=? AND password_hash=? RETURNING token_hash').bind(hash,now+LIFETIME*1000,user.id,user.password_hash).first();
  if(!inserted)return response({error:'账号状态已变化，请使用新密码重新登录'},401);
  await db.batch([
   db.prepare('DELETE FROM email_sessions WHERE expires_at<=? OR token_hash=?').bind(now,previous?await digest(previous):''),
   // Preserve the token returned to this caller even when multiple sessions expire together.
   db.prepare('DELETE FROM email_sessions WHERE token_hash IN (SELECT token_hash FROM email_sessions WHERE user_id=? AND token_hash<>? ORDER BY expires_at DESC,token_hash DESC LIMIT -1 OFFSET 9)').bind(user.id,hash),
  ]);
  return response({ok:true,account:{id:user.id,displayName:email},emailVerified:user.email_verified_at!==null},200,sessionCookie(raw));
 }catch(error){if(error instanceof RequestLimitError)return response({error:error.message},error.status);if(error instanceof SyntaxError)return response({error:'账号请求格式不正确'},400);return response({error:'账号服务暂不可用，请稍后再试'},503);}
 finally{working--;}
}
