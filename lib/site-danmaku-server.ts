import {env} from 'cloudflare:workers';
import {getSiteUser} from './email-auth';
import {readRequestText,RequestLimitError} from './request-guard';
import {siteDanmakuScope,siteDanmakuDraft,type SiteDanmakuPost} from './site-danmaku';
type Row={id:string;subject_id:number;episode:string;user_id:string;time_ms:number;mode:1|4|5;color:number;body:string;created_at:number;deleted_at:number|null};
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const post=(row:Row,user?:string):SiteDanmakuPost=>({id:row.id,time:row.time_ms/1000,mode:row.mode,color:row.color,body:row.body,createdAt:row.created_at,own:row.user_id===user});
export async function siteDanmakuResponse(req:Request){
 try{
  const url=new URL(req.url);if(!['GET','POST'].includes(req.method))return response({error:'请求方法不支持'},405);
  let input:any,draft:ReturnType<typeof siteDanmakuDraft>|undefined;
  if(req.method==='POST'){
   if(req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'跨站请求被拒绝'},403);
   if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response({error:'请使用 JSON 请求'},415);
   input=JSON.parse(await readRequestText(req,4096));if(!input||typeof input!=='object'||Array.isArray(input)||!uuid(input.mutationId))return response({error:'弹幕数据或操作标识无效'},400);
   if(input.operation==='delete'){if(!uuid(input.id))return response({error:'弹幕编号无效'},400);}else if(input.operation&&input.operation!=='create')return response({error:'弹幕操作无效'},400);else draft=siteDanmakuDraft(input);
  }
  const scope=req.method==='GET'?siteDanmakuScope(url.searchParams.get('subject'),url.searchParams.get('episode')):undefined;
  const db=env.DB;if(!db)return response({error:'本站弹幕数据库暂不可用'},503);
  const identity=await getSiteUser(req),user=identity?.provider==='email'?identity:undefined;
  if(req.method==='GET'){
   const mine=url.searchParams.get('mine')==='1',page=Number(url.searchParams.get('page')||1),time=Number(url.searchParams.get('time')||0);
   if(!Number.isInteger(page)||page<1||page>500||!Number.isFinite(time)||time<0||time>86400)return response({error:'弹幕时间或页码无效'},400);
   if(mine&&!user)return response({error:'请先登录本站邮箱账户'},401);
   if(mine){
    const rows=await db.prepare('SELECT * FROM site_danmaku WHERE user_id=? AND subject_id=? AND episode=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').bind(user!.userId,scope!.subjectId,scope!.episode,(page-1)*20).all<Row>();
    const count=await db.prepare('SELECT COUNT(*) AS total FROM site_danmaku WHERE user_id=? AND subject_id=? AND episode=? AND deleted_at IS NULL').bind(user!.userId,scope!.subjectId,scope!.episode).first<{total:number}>();
    return response({posts:rows.results.map(row=>post(row,user!.userId)),total:count?.total||0,page,authenticated:true,accountId:user!.userId});
   }
   const at=Math.round(time*1000),rows=await db.prepare('SELECT * FROM site_danmaku WHERE subject_id=? AND episode=? AND deleted_at IS NULL AND time_ms BETWEEN ? AND ? ORDER BY ABS(time_ms-?),created_at DESC LIMIT 501').bind(scope!.subjectId,scope!.episode,Math.max(0,at-12000),Math.min(86400000,at+48000),at).all<Row>();
   return response({posts:rows.results.slice(0,500).sort((a,b)=>a.time_ms-b.time_ms||a.id.localeCompare(b.id)).map(row=>post(row,user?.userId)),truncated:rows.results.length>500,authenticated:!!user,accountId:user?.userId||null});
  }
  if(!user)return response({error:'请先使用本站邮箱账户登录，再发送弹幕'},401);
  if(input.accountId!==user.userId)return response({error:'个人空间已切换，请刷新登录状态后重试'},409);
  if(input.operation==='delete'){
   const row=await db.prepare('SELECT id,user_id FROM site_danmaku WHERE id=?').bind(input.id).first<{id:string;user_id:string}>();
   if(!row||row.user_id!==user.userId)return response({error:'弹幕不存在或无权撤回'},403);
   await db.prepare("UPDATE site_danmaku SET body='',deleted_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(Date.now(),input.id,user.userId).run();return response({deleted:true,id:input.id});
  }
  const value=draft!,previous=()=>db.prepare('SELECT * FROM site_danmaku WHERE user_id=? AND mutation_id=? LIMIT 1').bind(user.userId,input.mutationId).first<Row>();
  const existing=(row:Row)=>row.deleted_at!==null||row.subject_id!==value.subjectId||row.episode!==value.episode||row.time_ms!==Math.round(value.time*1000)||row.mode!==value.mode||row.color!==value.color||row.body!==value.body?response({error:'这次操作已处理或内容已改变，请重新编辑后发送'},409):response({saved:true,post:post(row,user.userId)});
  const before=await previous();if(before)return existing(before);
  const now=Date.now(),id=crypto.randomUUID();
  const inserted=await db.prepare(`INSERT INTO site_danmaku(id,subject_id,episode,user_id,time_ms,mode,color,body,created_at,mutation_id)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM site_danmaku WHERE user_id=? AND created_at>?)
   AND (SELECT COUNT(*) FROM site_danmaku WHERE user_id=? AND created_at>?)<200
   ON CONFLICT(user_id,mutation_id) DO NOTHING RETURNING *`).bind(id,value.subjectId,value.episode,user.userId,Math.round(value.time*1000),value.mode,value.color,value.body,now,input.mutationId,user.userId,now-10000,user.userId,now-86400000).all<Row>();
  if(inserted.results.length)return response({saved:true,post:post(inserted.results[0],user.userId)},201);
  const after=await previous();if(after)return existing(after);
  return response({error:'发送过于频繁，请稍后重试（每 10 秒一条，每天最多 200 条）'},429);
 }catch(error){
  if(error instanceof RequestLimitError)return response({error:error.message},error.status);
  if(error instanceof SyntaxError)return response({error:'弹幕数据格式不正确'},400);
  if(error instanceof Error&&/番剧编号|集数|弹幕(?:数据|请输入|时间|位置|颜色)|请输入弹幕/.test(error.message))return response({error:error.message},400);
  return response({error:'本站弹幕读取或保存失败，请稍后重试'},503);
 }
}
