const MAX_BYTES=5*1024*1024;
// This endpoint accepts a Bangumi ID, never an arbitrary proxy URL.
export async function subjectCover(id:string,signal?:AbortSignal){
 if(!/^\d{1,10}$/.test(id))return Response.json({error:'无效条目 ID'},{status:400});
 let target='https://api.bgm.tv/v0/subjects/'+id+'/image?type=large';
 const deadline=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 for(let hop=0;hop<4;hop++){
  const response=await fetch(target,{redirect:'manual',signal:combined,headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'LingqiWeb/1.0'}});
  if(response.status>=300&&response.status<400){
   const location=response.headers.get('location');void response.body?.cancel().catch(()=>{});
   if(!location)throw Error('封面地址暂不可用');const next=new URL(location,target);
   if(next.protocol!=='https:'||next.hostname!=='lain.bgm.tv'||next.port||next.username||next.password||!/^\/(?:r\/[^/]+\/)?pic\/cover\//.test(next.pathname))throw Error('封面地址不在 Bangumi 图片目录中');
   target=next.href;continue;
  }
  if(!response.ok||!response.body){void response.body?.cancel().catch(()=>{});throw Error(response.status===404?'暂未收录封面':'封面暂时无法下载，请稍后重试');}
  const length=Number(response.headers.get('content-length'));if(length>MAX_BYTES){void response.body.cancel().catch(()=>{});throw Error('封面文件超过 5 MB');}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('封面文件超过 5 MB');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const type=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'png':new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP'?'webp':'';
  if(!type)throw Error('封面未返回有效图片，请稍后重试');
  return new Response(bytes,{headers:{'Content-Type':'image/'+type,'Content-Length':String(size),'Content-Disposition':'attachment; filename="bangumi-'+id+'-cover.'+(type==='jpeg'?'jpg':type)+'"','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }
 throw Error('封面跳转次数过多，请稍后重试');
}
