import {env} from 'cloudflare:workers';
import {getSiteUser} from './email-auth';
import {readRequestText,RequestLimitError} from './request-guard';
import {discussionScope,discussionText,type DiscussionPost} from './discussions';
type Row={id:string;parent_id:string|null;user_id:string;alias:string;body:string;created_at:number;deleted_at:number|null;reply_count?:number};
type SavedRow=Row & {subject_id:number;scope:string};
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
export async function discussionResponse(req:Request){
 try{
  const db=env.DB;if(!db)return response({error:'讨论数据库暂不可用'},503);const identity=await getSiteUser(req),user=identity?.provider==='email'?identity:null,u=new URL(req.url);
  if(req.method==='POST'){
   if(req.headers.get('origin')!==u.origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'跨站请求被拒绝'},403);
   if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response({error:'请使用 JSON 请求'},415);
   const input=JSON.parse(await readRequestText(req,12288));if(!input||typeof input!=='object'||Array.isArray(input))return response({error:'评论数据格式不正确'},400);if(!uuid(input.mutationId))return response({error:'操作标识无效'},400);
   if(!user)return response({error:'请先使用本站邮箱账户登录，再参与讨论'},401);
   if(input.accountId!==user.userId)return response({error:'个人空间已切换，请刷新登录状态后重试'},409);
   if(input.operation==='delete'){
    if(!uuid(input.id))return response({error:'评论编号无效'},400);
    const row=await db.prepare('SELECT id,user_id FROM discussion_posts WHERE id=?').bind(input.id).first<{id:string;user_id:string}>();
    if(!row||row.user_id!==user.userId)return response({error:'评论不存在或无权删除'},403);
    await db.prepare('UPDATE discussion_posts SET body=\'\',alias=\'已删除\',deleted_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(Date.now(),input.id,user.userId).run();return response({deleted:true,id:input.id});
   }
   if(input.operation&&input.operation!=='create')return response({error:'评论操作无效'},400);
   const id=Number(input.subjectId);if(!Number.isSafeInteger(id)||id<1||id>9999999999)return response({error:'番剧编号无效'},400);
   const scope=discussionScope(input.episode),body=discussionText(input.body),alias=discussionText(input.alias||'本站番友',24);
   let parent:string|null=null,parentDeleted=false;if(input.parentId){if(!uuid(input.parentId))return response({error:'回复编号无效'},400);const row=await db.prepare('SELECT id,parent_id,deleted_at FROM discussion_posts WHERE id=? AND subject_id=? AND scope=?').bind(input.parentId,id,scope).first<{id:string;parent_id:string|null;deleted_at:number|null}>();if(!row)return response({error:'回复的评论已删除，请刷新'},409);parent=row.parent_id||row.id;parentDeleted=row.deleted_at!==null;}
   const previous=()=>db.prepare('SELECT * FROM discussion_posts WHERE user_id=? AND mutation_id=? LIMIT 1').bind(user.userId,input.mutationId).first<SavedRow>();
   const existing=(row:SavedRow)=>row.deleted_at!==null||row.subject_id!==id||row.scope!==scope||row.parent_id!==parent||row.body!==body||row.alias!==alias?response({error:'这次操作已处理或内容已改变，请重新编辑后发送'},409):response({saved:true,id:row.id});
   const before=await previous();if(before)return existing(before);
   if(parentDeleted)return response({error:'回复的评论已删除，请刷新'},409);
   const now=Date.now(),postId=crypto.randomUUID();
   const result=await db.prepare(`INSERT INTO discussion_posts(id,subject_id,scope,parent_id,user_id,alias,body,created_at,mutation_id)
    SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM discussion_posts WHERE user_id=? AND created_at>?)
    AND (SELECT COUNT(*) FROM discussion_posts WHERE user_id=? AND created_at>?)<100
    ON CONFLICT(user_id,mutation_id) DO NOTHING RETURNING id`).bind(postId,id,scope,parent,user.userId,alias,body,now,input.mutationId,user.userId,now-10000,user.userId,now-86400000).all();
   if(result.results.length)return response({saved:true,id:postId},201);
   const after=await previous();if(after)return existing(after);
   return response({error:'发言过于频繁，请稍后再试（每 10 秒一条，每天最多 100 条）'},429);
  }
  const id=Number(u.searchParams.get('subject'));if(!Number.isSafeInteger(id)||id<1||id>9999999999)return response({error:'番剧编号无效'},400);
  const scope=discussionScope(u.searchParams.get('episode')),page=Math.min(500,Math.max(1,Math.floor(Number(u.searchParams.get('page'))||1)));
  const thread=u.searchParams.get('thread');if(thread&&!uuid(thread))return response({error:'讨论主题编号无效'},400);
  const roots=thread?await db.prepare('SELECT id,parent_id,user_id,alias,body,created_at,deleted_at FROM discussion_posts WHERE id=? AND subject_id=? AND scope=? AND parent_id IS NULL').bind(thread,id,scope).all<Row>():await db.prepare('SELECT p.id,p.parent_id,p.user_id,p.alias,p.body,p.created_at,p.deleted_at,(SELECT COUNT(*) FROM discussion_posts r WHERE r.parent_id=p.id) AS reply_count FROM discussion_posts p WHERE p.subject_id=? AND p.scope=? AND p.parent_id IS NULL ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET ?').bind(id,scope,(page-1)*20).all<Row>();
  if(thread&&!roots.results.length)return response({error:'讨论主题不存在'},404);
  const ids=roots.results.map(row=>row.id),replies=thread?await db.prepare('SELECT id,parent_id,user_id,alias,body,created_at,deleted_at FROM discussion_posts WHERE parent_id=? ORDER BY created_at ASC,id ASC LIMIT 20 OFFSET ?').bind(thread,(page-1)*20).all<Row>():ids.length?await db.prepare('SELECT id,parent_id,user_id,alias,body,created_at,deleted_at FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY parent_id ORDER BY created_at ASC,id ASC) AS row_num FROM discussion_posts WHERE subject_id=? AND scope=? AND parent_id IN ('+ids.map(()=>'?').join(',')+')) WHERE row_num<=20 ORDER BY created_at ASC,id ASC').bind(id,scope,...ids).all<Row>():{results:[] as Row[]};
  const count=thread?await db.prepare('SELECT COUNT(*) AS total FROM discussion_posts WHERE parent_id=?').bind(thread).first<{total:number}>():await db.prepare('SELECT COUNT(*) AS total FROM discussion_posts WHERE subject_id=? AND scope=? AND parent_id IS NULL').bind(id,scope).first<{total:number}>();
  const posts:DiscussionPost[]=[...roots.results,...replies.results].map(row=>({id:row.id,parentId:row.parent_id||undefined,alias:row.alias,body:row.deleted_at?'这条评论已删除':row.body,createdAt:row.created_at,deleted:!!row.deleted_at,own:row.user_id===user?.userId,...(row.reply_count!==undefined?{replyCount:row.reply_count}:{})}));
  return response({posts,total:count?.total||0,page,authenticated:!!user,accountId:user?.userId||null});
 }catch(error){if(error instanceof RequestLimitError)return response({error:error.message},error.status);if(error instanceof SyntaxError)return response({error:'评论数据格式不正确'},400);if(error instanceof Error&&/集数|评论请输入|评论内容/.test(error.message))return response({error:error.message},400);return response({error:'讨论加载或保存失败，请稍后重试'},503);}
}
