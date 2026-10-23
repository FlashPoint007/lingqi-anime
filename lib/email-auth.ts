import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {readRequestText,RequestLimitError} from './request-guard';
const COOKIE='__Host-lingqi-session',LIFETIME=7*86400,encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
function database(){if(!env.DB)throw Error('AUTH_UNAVAILABLE');return env.DB;}
function secret(){const key=(env as unknown as {LINGQI_AUTH_SECRET?:string}).LINGQI_AUTH_SECRET;if(!key||key.length<32)throw new Error('AUTH_UNAVAILABLE');return key;}
async function passwordHash(password:string,salt:string){
 // A server-only pepper protects database-only leaks. Store the algorithm and salt for future upgrades.
 const pepper=await crypto.subtle.importKey('raw',encoder.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const input=await crypto.subtle.sign('HMAC',pepper,encoder.encode('lingqi-password-v1:'+password));
 const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:encoder.encode(salt)},key,256));
}
function token(req:Request){const value=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:undefined;}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export async function getSiteUser(req:Request){
 const raw=token(req);
 if(req.headers.get('cookie')?.split(';').some(x=>x.trim().startsWith(COOKIE+'='))&&!raw)return null;
 if(raw){
  const row=await database().prepare('SELECT a.id,a.email FROM email_sessions s JOIN email_accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(raw),Date.now()).first<{id:string;email:string}>();
  if(row)return {userId:row.id,displayName:row.email,email:row.email,provider:'email'};
  // An expired email session never falls through to a different legacy account.
  return null;
 }
 const legacy=await getChatGPTUser();return legacy?{...legacy,provider:'chatgpt'}:null;
}
const response=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie',...(cookie?{'Set-Cookie':cookie}:{})}});
const sessionCookie=(value:string,seconds=LIFETIME)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
let working=0;
export async function emailAuthResponse(req:Request){
 if(req.method!=='POST')return response({error:'请求方法不支持'},405);
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'跨站请求被拒绝'},403);
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response({error:'请使用 JSON 请求'},415);
 if(working>=4)return response({error:'登录请求较多，请稍后再试'},429);
 working++;
 try{
  const body=JSON.parse(await readRequestText(req,4096));
  if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'账号请求格式不正确'},400);
  if(body.action==='logout'){
   const raw=token(req);if(raw)await database().prepare('DELETE FROM email_sessions WHERE token_hash=?').bind(await digest(raw)).run();
   return response({ok:true},200,sessionCookie('signed-out'));
  }
  if(!['login','register'].includes(body.action))return response({error:'无效账号操作'},400);
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const password=body.password;
  if(email.length>254||!/^\S+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email))return response({error:'请输入有效邮箱地址'},400);
  if(typeof password!=='string'||password.length<12||password.length>128)return response({error:'密码长度需为 12 至 128 个字符'},400);
  secret();
  // A global email bucket limits distributed password guessing without revealing whether the email exists.
  const now=Date.now(),window=Math.floor(now/900000)*900000;
  const bucket='email-auth:'+await digest(email)+':'+window;
  const attempts=await database().prepare('INSERT INTO email_attempts(key,expires_at,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(bucket,window+900000).first<{hits:number}>();
  await database().prepare('DELETE FROM email_attempts WHERE key IN (SELECT key FROM email_attempts WHERE expires_at<=? LIMIT 1000)').bind(now).run();
  if(!attempts||attempts.hits>10)return response({error:'该账号尝试过于频繁，请 15 分钟后重试'},429);
  let user=await database().prepare('SELECT id,email,password_hash FROM email_accounts WHERE email=?').bind(email).first<{id:string;email:string;password_hash:string}>();
  if(body.action==='register'){
   const salt=random(),hash=await passwordHash(password,salt);
   if(user)return response({error:'无法注册此邮箱，请登录或使用其他邮箱'},409);
   const id='email:'+crypto.randomUUID();
   try{await database().prepare('INSERT INTO email_accounts(id,email,password_hash,created_at) VALUES(?,?,?,?)').bind(id,email,'pbkdf2-pepper-v1$'+salt+'$'+hash,now).run();}catch{return response({error:'无法注册此邮箱，请稍后重试或登录'},409);}
   user={id,email,password_hash:''};
  }else{
   const parts=user?.password_hash.split('$')||[];
   const actual=await passwordHash(password,parts[1]||'unregistered-email-dummy-salt');
   if(!user||parts[0]!=='pbkdf2-pepper-v1'||!equal(actual,parts[2]||''))return response({error:'邮箱或密码不正确'},401);
  }
  const raw=random(),hash=await digest(raw),previous=token(req);
  await database().batch([
   database().prepare('INSERT INTO email_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash,user.id,now+LIFETIME*1000),
   database().prepare('DELETE FROM email_sessions WHERE expires_at<=? OR token_hash=?').bind(now,previous?await digest(previous):''),
   database().prepare('DELETE FROM email_sessions WHERE token_hash IN (SELECT token_hash FROM email_sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT -1 OFFSET 10)').bind(user.id),
  ]);
  return response({ok:true,account:{id:user.id,displayName:email},emailVerified:false},200,sessionCookie(raw));
 }catch(error){if(error instanceof RequestLimitError)return response({error:error.message},error.status);if(error instanceof SyntaxError)return response({error:'账号请求格式不正确'},400);return response({error:'账号服务暂不可用，请稍后再试'},503);}
 finally{working--;}
}
