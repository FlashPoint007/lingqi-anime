// Keep old transfers compatible while exposing the new atomic comment writer.
import {openOfflineDB} from './offline-db.mjs';
import {parseOfflineDanmaku} from './offline-danmaku.mjs';
export * from './offline-transfer-v2.mjs';
export async function updateOfflineDanmaku(id,owner,value){
 const data=parseOfflineDanmaku(value);if(!data)throw Error('离线弹幕数据无效');
 const db=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=db.transaction('downloads','readwrite'),store=tx.objectStore('downloads'),request=store.get(id);let updated;
  request.onsuccess=()=>{const record=request.result;if(!record||record.owner!==owner||record.status!=='complete'||record.danmaku?.savedAt>data.savedAt)return;updated={...record,danmaku:data};store.put(updated);};
  tx.oncomplete=()=>resolve(updated);tx.onabort=()=>reject(tx.error||Error('离线弹幕保存失败'));tx.onerror=()=>reject(tx.error);
 });
}
