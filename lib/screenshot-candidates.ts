import {zipEntries,type ZipEntry} from './download-zip';
export const SCREENSHOT_LIMIT=24,SCREENSHOT_BYTES=32*1024*1024;
export type ScreenshotCandidate={id:string;blob:Blob;url:string;title:string;episode:string;time:number;createdAt:number};
export function screenshotFilename(item:Pick<ScreenshotCandidate,'id'|'time'>){return 'lingqi-'+Math.floor(item.time)+'s-'+item.id+'.png';}
export function checkScreenshotCapacity(items:Pick<ScreenshotCandidate,'blob'>[],blob:Blob){if(blob.type!=='image/png'||!blob.size)throw Error('截图未返回有效 PNG 图片');if(items.length>=SCREENSHOT_LIMIT)throw Error('候选区最多保存 24 张，请先保存或删除部分截图');if(items.reduce((n,item)=>n+item.blob.size,0)+blob.size>SCREENSHOT_BYTES)throw Error('候选截图超过 32 MB，请先保存或删除部分截图');}
export async function screenshotArchive(items:ScreenshotCandidate[]){
 if(!items.length||items.length>SCREENSHOT_LIMIT||items.reduce((n,item)=>n+item.blob.size,0)>SCREENSHOT_BYTES)throw Error('请选择 1 至 24 张截图，总大小不超过 32 MB');
 const entries:ZipEntry[]=items.map(item=>({name:screenshotFilename(item),async *open(){yield new Uint8Array(await item.blob.arrayBuffer());}})),parts:BlobPart[]=[];
 for await(const bytes of zipEntries(entries))parts.push(bytes.slice().buffer as ArrayBuffer);return new Blob(parts,{type:'application/zip'});
}
