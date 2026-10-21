// Device-local media only. No video bytes are sent to the site's database.
export const DB_NAME='lingqi-offline-v1';
export const CHUNK_SIZE=2*1024*1024;
let opening;
export function openOfflineDB(){
 if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('downloads',{keyPath:'id'});const assets=db.createObjectStore('assets',{keyPath:['download','id']});assets.createIndex('download','download');const chunks=db.createObjectStore('chunks',{keyPath:['download','asset','index']});chunks.createIndex('download','download');};request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=undefined;};resolve(request.result);};request.onerror=()=>{opening=undefined;reject(request.error);};request.onblocked=()=>{opening=undefined;reject(Error('请关闭旧的离线窗口后重试'));};});return opening;
}
export async function readOffline(store,key){const db=await openOfflineDB();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function writeOffline(store,value){const db=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('离线数据写入失败'));tx.onerror=()=>reject(tx.error);});}
// Read and update in one transaction: a late progress save must never recreate
// a download that was deleted in another tab, or acknowledge a newer position.
export async function updateOfflineProgress(id,owner,change){
 const db=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=db.transaction('downloads','readwrite'),store=tx.objectStore('downloads'),request=store.get(id);let updated;
  request.onsuccess=()=>{const record=request.result;if(!record||record.owner!==owner||record.status!=='complete')return;
   if(change.ackTime!==undefined){if(record.progressAt!==change.ackTime)return;updated={...record,historyPending:false};}
   else{if(!Number.isFinite(change.position)||change.position<0||!Number.isFinite(change.progressAt)||change.progressAt<(record.progressAt||0))return;updated={...record,position:Math.min(604800,change.position),duration:Number.isFinite(change.duration)?Math.max(0,Math.min(604800,change.duration)):0,progressAt:change.progressAt,historyPending:true};}
   store.put(updated);
  };tx.oncomplete=()=>resolve(updated);tx.onabort=()=>reject(tx.error||Error('离线进度保存失败'));tx.onerror=()=>reject(tx.error);
 });
}
export async function listOffline(){const db=await openOfflineDB();return new Promise((resolve,reject)=>{const req=db.transaction('downloads').objectStore('downloads').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt));req.onerror=()=>reject(req.error);});}
export async function removeOffline(id){
 const db=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=db.transaction(['downloads','assets','chunks'],'readwrite');tx.objectStore('downloads').delete(id);for(const store of ['assets','chunks']){const request=tx.objectStore(store).index('download').openKeyCursor(IDBKeyRange.only(id));request.onsuccess=()=>{const cursor=request.result;if(cursor){tx.objectStore(store).delete(cursor.primaryKey);cursor.continue();}};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
}
export function offlineAssetURL(download,asset){return '/__offline_media/'+encodeURIComponent(download)+'/'+encodeURIComponent(asset);}
export function byteRange(header,size){
 if(!header)return {start:0,end:size-1,partial:false};const match=header.match(/^bytes=(\d*)-(\d*)$/);if(!match||!match[1]&&!match[2])return null;
 const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end,partial:true}:null;
}
