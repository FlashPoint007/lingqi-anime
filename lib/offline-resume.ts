// Identity comparison only. Decoding never authorizes or initiates a request.
export function offlineIdentity(raw:string,origin:string){
 const u=new URL(raw,origin);
 if(u.origin===origin&&u.pathname==='/api/media')try{
  const payload=u.searchParams.get('ticket')?.split('.')[0];
  if(payload&&payload.length<14000){const ticket=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));const target=new URL(ticket.url);if(target.protocol==='https:'&&!target.username&&!target.password)return target.href;}
 }catch{}
 return u.href;
}
export function responseValidator(headers:Headers){const etag=headers.get('etag');return etag&&etag.startsWith('"')&&etag.endsWith('"')&&etag.length<=256?etag:headers.get('last-modified')&&headers.get('last-modified')!.length<=256&&Number.isFinite(Date.parse(headers.get('last-modified')!))?headers.get('last-modified')!:undefined;}
export function validResume(response:Response,offset:number,validator:string,total:number){
 const match=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
 return response.status===206&&!!match&&Number(match[1])===offset&&Number(match[2])+1===total&&Number(match[3])===total&&responseValidator(response.headers)===validator;
}
