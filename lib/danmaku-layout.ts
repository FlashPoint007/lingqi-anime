import type {DanmakuComment,DanmakuSettings} from './danmaku';
export type LaidDanmaku={comment:DanmakuComment;start:number;end:number;y:number;width:number;velocity:number};
// Layout is deterministic on the media clock: pause, seek and rate changes need no timers.
export function layoutDanmaku(comments:DanmakuComment[],width:number,height:number,settings:DanmakuSettings,measure:(text:string)=>number){
 if(width<=0||height<=0)return [];
 const lineHeight=Math.ceil(settings.fontSize*1.5),lanes=Math.max(1,Math.min(24,Math.floor(height*settings.area/lineHeight))),last:Array<LaidDanmaku|undefined>=Array(lanes),result:LaidDanmaku[]=[];
 const duration=8/settings.speed;
 for(const comment of comments){
  const textWidth=Math.min(width*2,measure(comment[3])),velocity=(width+textWidth)/duration,start=comment[0],end=start+duration;
  const pinned=comment[1]!==1;
  const lane=Array.from({length:lanes},(_,i)=>comment[1]===4?lanes-1-i:i).find(i=>{
   const previous=last[i];if(!previous||previous.end<=start)return true;
   if(pinned||previous.comment[1]!==1)return false;
   return start>=Math.max(previous.start+(previous.width+16)/previous.velocity,previous.end-(width-16)/velocity);
  });
  if(lane===undefined)continue;
  const row={comment,start,end,y:Math.round(lineHeight*(lane+.75)),width:textWidth,velocity};last[lane]=row;result.push(row);
 }return result;
}
export function activeDanmaku(rows:LaidDanmaku[],time:number,maxDuration:number){
 // Binary search excludes the rest of a long episode on each animation frame.
 let left=0,right=rows.length;while(left<right){const mid=(left+right)>>>1;if(rows[mid].start<time-maxDuration)left=mid+1;else right=mid;}
 const active:LaidDanmaku[]=[];for(let i=left;i<rows.length&&rows[i].start<=time;i++)if(rows[i].end>time)active.push(rows[i]);return active;
}
