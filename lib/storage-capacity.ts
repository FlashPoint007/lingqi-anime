export type StorageCapacity={state:'ready';usage:number;quota:number;available:number;ratio:number}|{state:'unsupported'|'unavailable'};
export const CAPACITY_REFRESH_MS=15000;

export function normalizeStorageCapacity(value:StorageEstimate):StorageCapacity{
 const {usage,quota}=value;
 if(typeof usage!=='number'||!Number.isFinite(usage)||usage<0||typeof quota!=='number'||!Number.isFinite(quota)||quota<0)return {state:'unavailable'};
 return {state:'ready',usage,quota,available:Math.max(0,quota-usage),ratio:quota?Math.min(1,usage/quota):1};
}
export async function capacityDeadline<T>(read:()=>Promise<T>,milliseconds=6000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve().then(read),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('存储统计超时')),milliseconds);})]);}
 finally{clearTimeout(timer);}
}
export async function readStorageCapacity(storage?:Pick<StorageManager,'estimate'>):Promise<StorageCapacity>{
 if(typeof storage?.estimate!=='function')return {state:'unsupported'};
 try{return normalizeStorageCapacity(await capacityDeadline(()=>storage.estimate()));}catch{return {state:'unavailable'};}
}
export function storageSize(bytes:number):string{
 if(!Number.isFinite(bytes)||bytes<0)return '未知';
 const units=['B','KiB','MiB','GiB','TiB'];let value=bytes,index=0;
 while(value>=1024&&index<units.length-1){value/=1024;index++;}
 return (index?value.toFixed(1):Math.floor(value).toString())+' '+units[index];
}
