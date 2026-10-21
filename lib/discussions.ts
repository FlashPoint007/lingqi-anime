export type DiscussionPost={id:string;parentId?:string;alias:string;body:string;createdAt:number;deleted:boolean;own:boolean;replyCount?:number};
export function discussionScope(episode:unknown){if(episode===undefined||episode===null||episode==='')return 'subject';const n=Number(episode);if(!Number.isFinite(n)||n<=0||n>100000||!/^\d+(?:\.\d{1,3})?$/.test(String(n)))throw new Error('集数无效');return 'episode:'+n;}
export function discussionText(value:unknown,max=2000){if(typeof value!=='string')throw new Error('评论内容格式不正确');const text=value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();if(!text||text.length>max)throw new Error('评论请输入 1 至 '+max+' 个字符');return text;}
export function publicComments(raw:any,episode:boolean,offset=0){
 const source=episode?raw:raw?.list||raw?.data;if(!Array.isArray(source))throw new Error('Bangumi 讨论数据格式不正确');
 const rows:DiscussionPost[]=[];let seen=0;
 for(const [index,item] of source.slice(episode?offset:0,episode?offset+20:20).entries()){
  const clean=(value:any,id:string,parentId?:string)=>{if(!value||typeof value!=='object'||seen++>220)return;const body=String(episode?value.content||'':value.comment||'').slice(0,6000).replace(/\[\/?(?:url|img|b|i|u|s|color|size|quote|spoiler)(?:=[^\]]*)?\]/gi,'');if(!body.trim())return;const timestamp=Number(value.createdAt||value.updatedAt||0);rows.push({id,parentId,alias:String(value.user?.nickname||value.user?.username||'Bangumi 用户').slice(0,80),body,createdAt:Number.isFinite(timestamp)?timestamp*1000:0,deleted:false,own:false});};
  const root=String(item.id||'bgm-'+(offset+index));clean(item,root);if(episode)for(const [index,reply] of (Array.isArray(item.replies)?item.replies:[]).slice(0,10).entries())clean(reply,root+'-'+index,root);
 }
 return {posts:rows,total:episode?source.length:Math.max(Number(raw.total)||0,rows.length)};
}
