// Versioned entry avoids stale writers in already-installed offline shells.
import {openOfflineDB} from './offline-db.mjs';
import {parseOfflineDanmaku} from './offline-danmaku.mjs';
export * from './offline-transfer-v2.mjs';
export async function updateOfflineDanmaku(id,owner,value){
 const data=parseOfflineDanmaku(value);if(!data)throw Error('离线弹幕数据无效');
 const db=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=db.transaction('downloads','readwrite'),store=tx.objectStore('downloads'),request=store.get(id);let updated,failure;
  request.onsuccess=()=>{const record=request.result;if(!record||record.owner!==owner||record.status!=='complete')return;if(record.danmaku?.savedAt>data.savedAt){failure=Error('本集弹幕已有更新，已保留最新版本');return;}const previous=parseOfflineDanmaku(record.danmaku);if(previous?.comments.length&&(data.status==='unavailable'||data.notes.length)){failure=Error('弹幕更新未完整成功，已保留原有离线弹幕'+(data.notes[0]?'：'+data.notes[0]:''));return;}updated={...record,danmaku:data};store.put(updated);};
  tx.oncomplete=()=>failure?reject(failure):resolve(updated);tx.onabort=()=>reject(tx.error||Error('离线弹幕保存失败'));tx.onerror=()=>reject(tx.error);
 });
}
