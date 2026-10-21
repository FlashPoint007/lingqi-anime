export type Credit={id:number;name:string;role:string;image?:string;actors:{id:number;name:string}[]};
const text=(v:unknown,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
export function credits(value:unknown,kind:'character'|'staff'='character'):Credit[]{
 if(!Array.isArray(value))return [];
 const result=new Map<number,Credit>();
 for(const row of value.slice(0,1000)){
  if(!row||!Number.isSafeInteger(row.id)||row.id<1||row.id>9999999999||!text(row.name))continue;
  let image:string|undefined;try{const u=new URL(row.images?.medium||row.images?.small||row.image);if(u.protocol==='https:'&&u.hostname==='lain.bgm.tv'&&!u.username&&!u.password)image=u.href;}catch{}
  const actors=Array.isArray(row.actors)?row.actors.slice(0,8).flatMap((actor:any)=>Number.isSafeInteger(actor?.id)&&actor.id>0&&actor.id<=9999999999&&text(actor.name)?[{id:actor.id,name:text(actor.name)}]:[]):[];
  const previous=result.get(row.id),role=text(row.relation||row.role||row.type);
  result.set(row.id,{id:row.id,name:text(row.name),role:[...new Set([...(previous?.role.split(' / ')||[]),role].filter(Boolean))].join(' / '),image:image||previous?.image,actors:[...new Map([...(previous?.actors||[]),...actors].map(actor=>[actor.id,actor])).values()].slice(0,8)});

 }
 const list=[...result.values()];
 if(kind==='staff'){const priorities=[/原作|总导演|导演/,/系列构成|脚本/,/人物设定|角色设计|动画制作/,/音乐|音响监督/,/作画监督|美术监督|摄影监督|色彩设计/,/制作|制片/];const rank=(role:string)=>{const i=priorities.findIndex(pattern=>pattern.test(role));return i<0?priorities.length:i;};list.sort((a,b)=>rank(a.role)-rank(b.role));}
 return list.slice(0,60);
}
type Upstream=(url:string)=>Promise<any>;
export async function loadSubjectPeople(id:string,upstream:Upstream){
 if(!/^\d{1,10}$/.test(id))throw Error('无效条目 ID');
 const subject=await upstream('https://api.bgm.tv/v0/subjects/'+id);
 if(subject?.id!==Number(id)||subject.type!==2||subject.nsfw===true)throw Error('该条目不提供人物资料');
 const results=await Promise.allSettled(['characters','persons'].map(kind=>upstream('https://api.bgm.tv/v0/subjects/'+id+'/'+kind)));
 if(results.every(r=>r.status==='rejected'))throw Error('角色与制作人员暂时无法加载，请稍后重试');
 const list=(at:number)=>{const r=results[at];if(r.status!=='fulfilled')return [];if(!Array.isArray(r.value))throw Error('人物资料格式不正确');return credits(r.value,at===1?'staff':'character');};
 return {characters:list(0),staff:list(1),partial:results.some(r=>r.status==='rejected')};
}
