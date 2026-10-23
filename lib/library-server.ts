import {env} from 'cloudflare:workers';
import {getSiteUser} from './email-auth';
import {readRequestText,RequestLimitError} from './request-guard';
import {valueSubjectId,libraryValue,entryKey,type LibraryChange,type LibraryEntry} from './library-model';
type Row={kind:'collection'|'history'|'aliases'|'danmaku';subject_id:number;value_json:string|null;version:number;updated_at:number;sort_at:number};
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Pragma':'no-cache'}});
const query='SELECT kind,subject_id,value_json,version,updated_at,sort_at FROM personal_items WHERE user_id = ? ORDER BY sort_at DESC,subject_id DESC';
function parseChange(value:any):LibraryChange{
 if(!value||!['collection','history','aliases','danmaku'].includes(value.kind)||!Number.isSafeInteger(value.id)||value.id<0||value.id>9999999999||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||typeof value.mutationId!=='string'||!/^[-\w]{16,80}$/.test(value.mutationId))throw new Error('同步操作格式不正确');
 if(value.kind==='danmaku'&&value.id!==0)throw new Error('弹幕偏好编号格式不正确');
 const clean=libraryValue(value.kind,value.value);if(clean!==null&&valueSubjectId(value.kind,clean)!==value.id)throw new Error('记录与番剧 ID 不一致');
 if(new TextEncoder().encode(JSON.stringify(clean)).length>32768)throw new RequestLimitError('单条记录过大',413);
 return {kind:value.kind,id:value.id,value:clean,expectedVersion:value.expectedVersion,mutationId:value.mutationId};
}
async function entries(db:D1Database,userId:string,extended=1):Promise<LibraryEntry[]>{
 const rows=await db.prepare(query).bind(userId).all<Row>();return rows.results.filter(row=>row.kind!=='danmaku'&&(extended>=2||row.kind!=='aliases')||extended>=3).map(row=>({kind:row.kind,id:row.subject_id,value:row.value_json===null?null:JSON.parse(row.value_json),version:row.version,updatedAt:row.updated_at,sortAt:row.sort_at}));
}
// Both the insert and update check the caller's last observed version. Tombstones
// retain that version so old devices and repeat migrations cannot revive deletions.
const write=`INSERT INTO personal_items(user_id,kind,subject_id,value_json,version,updated_at,sort_at,mutation_id)
 SELECT ?,?,?,?,1,?,?,? WHERE
 (? = 0 OR EXISTS(SELECT 1 FROM personal_items WHERE user_id=? AND kind=? AND subject_id=? AND (version=? OR mutation_id=?)))
 AND (? NOT IN ('collection','aliases') OR ? IS NULL OR EXISTS(SELECT 1 FROM personal_items WHERE user_id=? AND kind=? AND subject_id=? AND value_json IS NOT NULL)
 OR (SELECT COUNT(*) FROM personal_items WHERE user_id=? AND kind=? AND value_json IS NOT NULL)<1000)
 ON CONFLICT(user_id,kind,subject_id) DO UPDATE SET
 value_json=CASE WHEN personal_items.mutation_id=excluded.mutation_id THEN personal_items.value_json ELSE excluded.value_json END,
 version=CASE WHEN personal_items.mutation_id=excluded.mutation_id THEN personal_items.version ELSE personal_items.version+1 END,
 updated_at=CASE WHEN personal_items.mutation_id=excluded.mutation_id THEN personal_items.updated_at ELSE excluded.updated_at END,
 sort_at=CASE WHEN personal_items.mutation_id=excluded.mutation_id THEN personal_items.sort_at ELSE excluded.sort_at END,
 mutation_id=excluded.mutation_id WHERE personal_items.version=? OR personal_items.mutation_id=? RETURNING kind,subject_id,version`;
export async function libraryResponse(req:Request){
 try{
  const extended=['2','3'].includes(new URL(req.url).searchParams.get('version')||'')?Number(new URL(req.url).searchParams.get('version')):1;const user=await getSiteUser(req);if(!user)return response({authenticated:false,entries:[],...(req.method==='POST'?{error:'请先登录，再同步追番和观看记录'}:{})},req.method==='POST'?401:200);
  const db=env.DB;if(!db)return response({error:'个人数据库暂不可用，请稍后重试'},503);
  const account={id:user.userId,displayName:user.displayName,provider:user.provider};
  if(req.method!=='POST')return response({authenticated:true,account,entries:await entries(db,user.userId,extended)});
  if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'跨站请求被拒绝'},403);
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response({error:'请使用 JSON 请求'},415);
  const body=JSON.parse(await readRequestText(req,262144));if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'同步数据格式不正确'},400);if(body.accountId!==user.userId)return response({error:'登录账号已变化，请刷新后同步'},409);
  if(!Array.isArray(body?.changes)||body.changes.length<1||body.changes.length>50)throw new Error('每次同步需包含 1 至 50 项操作');
  const changes:LibraryChange[]=body.changes.map(parseChange);if(changes.some(change=>extended<3&&change.kind==='danmaku'||extended<2&&change.kind==='aliases'))throw new Error('别名同步需要新版接口');if(new Set(changes.map(entryKey)).size!==changes.length)throw new Error('同步操作包含重复条目');
  const now=Date.now();
  const statements=changes.map(change=>{
   const value=change.value;if(change.kind==='history'&&value)(value as any).time=Math.min(now+60000,(value as any).time);
   const json=value===null?null:JSON.stringify(value),sortAt=change.kind==='history'&&value?(value as any).time:now;
   return db.prepare(write).bind(user.userId,change.kind,change.id,json,now,sortAt,change.mutationId,
    change.expectedVersion,user.userId,change.kind,change.id,change.expectedVersion,change.mutationId,
    change.kind,json,user.userId,change.kind,change.id,user.userId,change.kind,change.expectedVersion,change.mutationId);
  });
  const written=await db.batch(statements);const accepted=changes.filter((_,index)=>written[index].results.length).map(change=>change.mutationId);
  await db.prepare("UPDATE personal_items SET value_json=NULL,version=version+1,updated_at=? WHERE user_id=? AND kind='history' AND value_json IS NOT NULL AND subject_id IN (SELECT subject_id FROM personal_items WHERE user_id=? AND kind='history' AND value_json IS NOT NULL ORDER BY sort_at DESC,subject_id DESC LIMIT -1 OFFSET 100)").bind(now,user.userId,user.userId).run();
  const snapshot=await entries(db,user.userId,extended),lookup=new Map(snapshot.map(entry=>[entryKey(entry),entry]));
  const conflicts=changes.filter(change=>!accepted.includes(change.mutationId)&&(lookup.get(entryKey(change))?.version??0)!==change.expectedVersion).map(change=>change.mutationId);
  const limited=changes.filter(change=>!accepted.includes(change.mutationId)&&!conflicts.includes(change.mutationId)).map(change=>change.mutationId);
  return response({authenticated:true,account,entries:snapshot,accepted,conflicts,limited});
 }catch(error){if(error instanceof RequestLimitError)return response({error:error.message},error.status);if(error instanceof SyntaxError)return response({error:'同步数据格式不正确'},400);if(error instanceof Error&&/格式|同步|记录与/.test(error.message))return response({error:error.message},400);return response({error:'个人数据保存失败，请稍后重试；待同步记录仍保留在浏览器'},503);}
}
