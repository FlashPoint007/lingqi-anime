import {anySignal,requestJson,timeoutSignal} from './request-client';
export type BrowserDownload={url:string;format:'mp4'|'webm'|'zip';filename:string;expiresAt:number};
// Older persisted tasks do not know their authorization deadline. Prepare them
// again rather than assuming that a new download check renewed the media ticket.
export function downloadExpired(download:Partial<BrowserDownload>){return !Number.isSafeInteger(download.expiresAt)||download.expiresAt!<=Date.now()+5000;}
export async function prepareLocalDownload(input:{url:string;name:string;mediaType?:'hls'|'video'},signal:AbortSignal):Promise<BrowserDownload>{
 const data=await requestJson('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:anySignal([signal,timeoutSignal(30000)]),credentials:'same-origin'}) as Partial<BrowserDownload>;
 if(typeof data.url!=='string'||typeof data.filename!=='string'||!data.format||!['mp4','webm','zip'].includes(data.format))throw new Error('下载地址无效，请重新解析');
 const address=new URL(data.url,location.href);
 if(address.origin!==location.origin||address.pathname!=='/api/download'||!['mp4','webm','zip'].includes(data.format)||typeof data.filename!=='string')throw new Error('下载地址无效，请重新解析');
 if(downloadExpired(data))throw new Error('下载链接已过期，请重新解析当前剧集');
 return {url:address.pathname+address.search,format:data.format,filename:data.filename,expiresAt:data.expiresAt!};
}
export function handToBrowser(download:BrowserDownload){
 // A real same-origin attachment request belongs to the browser download
 // manager. Do not fetch a Blob, attach an iframe, or tie it to pagehide.
 const address=new URL(download.url,location.href);if(address.origin!==location.origin||address.pathname!=='/api/download'||!address.searchParams.has('ticket')||!['mp4','webm','zip'].includes(download.format))throw new Error('下载地址无效，请重新准备');
 if(downloadExpired(download))throw new Error('下载链接已过期，请重新准备');
 const link=document.createElement('a');link.href=download.url;link.download=download.filename;link.rel='noreferrer';document.body.appendChild(link);try{link.click();}finally{link.remove();}
}
