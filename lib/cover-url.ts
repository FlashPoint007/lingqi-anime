export function coverUrl(src:string|undefined,size:'card'|'large'='card'){
 if(!src)return src;
 try{const url=new URL(src);if(['http:','https:'].includes(url.protocol)&&url.hostname==='lain.bgm.tv'){url.protocol='https:';if(size==='card')url.pathname=url.pathname.replace(/^\/(?:r\/\d+\/)?pic\/cover\/[lmcsg]\//,'/r/400/pic/cover/l/');return url.href;}return src;}catch{return src;}
}
