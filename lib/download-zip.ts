// Streaming, uncompressed ZIP32 with data descriptors (PKWARE APPNOTE 4.3.9).
// Only directory metadata is retained; media bytes follow consumer backpressure.
export type ZipEntry={name:string;open:()=>AsyncIterable<Uint8Array>};
const encoder=new TextEncoder(),MAX_BYTES=2*1024*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function header(size:number){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
export async function* zipEntries(entries:Iterable<ZipEntry>):AsyncGenerator<Uint8Array>{
 let offset=0;const directory:Uint8Array[]=[];
 const count=(bytes:Uint8Array)=>{offset+=bytes.length;if(offset>MAX_BYTES)throw new Error('HLS 文件包超过 2 GB，请选择其他线路');return bytes;};
 for(const entry of entries){
  if(directory.length>=4100||!/^[-a-zA-Z0-9_./]+$/.test(entry.name)||entry.name.includes('..')||entry.name.startsWith('/'))throw new Error('下载文件路径无效');
  const name=encoder.encode(entry.name),start=offset,local=header(30+name.length);
  local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x808,true);local.view.setUint16(12,33,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30);yield count(local.bytes);
  let size=0,crc=0xffffffff;
  for await(const part of entry.open()){
   for(let at=0;at<part.length;at+=65536){const bytes=part.subarray(at,at+65536);size+=bytes.length;for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);yield count(bytes);}
  }
  crc=(crc^0xffffffff)>>>0;
  const descriptor=header(16);descriptor.view.setUint32(0,0x08074b50,true);descriptor.view.setUint32(4,crc,true);descriptor.view.setUint32(8,size,true);descriptor.view.setUint32(12,size,true);yield count(descriptor.bytes);
  const central=header(46+name.length);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x808,true);central.view.setUint16(14,33,true);central.view.setUint32(16,crc,true);central.view.setUint32(20,size,true);central.view.setUint32(24,size,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,start,true);central.bytes.set(name,46);directory.push(central.bytes);
 }
 const start=offset;for(const item of directory)yield count(item);const length=offset-start,end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,directory.length,true);end.view.setUint16(10,directory.length,true);end.view.setUint32(12,length,true);end.view.setUint32(16,start,true);yield count(end.bytes);
}
export function zipStream(entries:Iterable<ZipEntry>,abort:AbortController){
 const iterator=zipEntries(entries);
 return new ReadableStream<Uint8Array>({async pull(controller){try{const {value,done}=await iterator.next();if(done)controller.close();else controller.enqueue(value);}catch(error){abort.abort(error);controller.error(error);}},async cancel(reason){abort.abort(reason);await iterator.return(undefined);}});
}
