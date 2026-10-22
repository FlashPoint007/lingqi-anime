import {browseData,readBrowseCache,saveBrowseCache,browseCacheFresh,type BrowseData} from './browse-client';
import {requestJson,anySignal,timeoutSignal} from './request-client';
import type {Subject} from './catalog';
// Consume whole source pages so eligible titles are never skipped between batches.
// The original total remains labelled as the original catalogue, never an invented filtered count.
export async function filteredBrowse(params:URLSearchParams,excluded:Set<number>,signal:AbortSignal,force=false){
 let next=Number(params.get('page')||1),hasMore=true,last:BrowseData|undefined;const data:Subject[]=[];let hidden=0;
 for(let count=0;count<3&&hasMore&&data.length<20;count++){
  signal.throwIfAborted();const request=new URLSearchParams(params);request.set('page',String(next));const key=request.toString(),saved=readBrowseCache(key);
  last=!force&&browseCacheFresh(saved)?saved!:browseData(await requestJson('/api/catalog?'+key+(force?'&refresh=1':''),{signal:anySignal([signal,timeoutSignal(20000)])}));if(last.page!==next)throw Error('番剧分页不匹配，请重试');if(last!==saved)saveBrowseCache(key,last);
  for(const subject of last.data)if(excluded.has(subject.id))hidden++;else data.push(subject);
  hasMore=next*20<(last.searchLimited?Math.min(1000,last.total):last.total);next++;
 }
 return {...last!,data,next:hasMore?next:undefined,hidden};
}
