export type BrowserDownload={url:string;format:'mp4'|'webm'|'zip';filename:string};
export async function prepareLocalDownload(input:{url:string;name:string;mediaType?:'hls'|'video'},signal:AbortSignal):Promise<BrowserDownload>{
 const response=await fetch('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal,credentials:'same-origin'});
 const data=await response.json() as Partial<BrowserDownload>&{error?:string};if(!response.ok)throw new Error(data.error||'暂时无法下载，请重试');
 if(typeof data.url!=='string'||typeof data.filename!=='string'||!data.format||!['mp4','webm','zip'].includes(data.format))throw new Error('下载地址无效，请重新解析');
 const address=new URL(data.url,location.href);
 if(address.origin!==location.origin||address.pathname!=='/api/download'||!['mp4','webm','zip'].includes(data.format)||typeof data.filename!=='string')throw new Error('下载地址无效，请重新解析');
 return {url:address.pathname+address.search,format:data.format,filename:data.filename};
}
export function handToBrowser(download:BrowserDownload){
 // A real same-origin attachment request belongs to the browser download
 // manager. Do not fetch a Blob, attach an iframe, or tie it to pagehide.
 const link=document.createElement('a');link.href=download.url;link.download=download.filename;link.rel='noreferrer';document.body.appendChild(link);try{link.click();}finally{link.remove();}
}
