export function coverUrl(src:string|undefined,size:'card'|'large'='card'){
 if(!src)return src;
 try{
  const url=new URL(src);
  if(!['http:','https:'].includes(url.protocol))return src;
  if(url.hostname==='lain.bgm.tv'){
   url.protocol='https:';
   if(size==='card')url.pathname=url.pathname.replace(/^\/(?:r\/\d+\/)?pic\/cover\/[lmcsg]\//,'/r/400/pic/cover/l/');
   return url.href;
  }
  if(url.hostname==='api.bgm.tv'&&/^\/v0\/subjects\/\d+\/image$/.test(url.pathname)){
   url.protocol='https:';
   if(size==='card')url.searchParams.set('type','common');
   return url.href;
  }
  return src;
 }catch{return src;}
}
