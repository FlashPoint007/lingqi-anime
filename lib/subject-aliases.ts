export type SubjectAliases=Record<string,string[]>;
export type AliasRecord={subjectId:number;aliases:string[]};
export function cleanAliases(value:unknown):string[]{
 if(!Array.isArray(value))return [];const seen=new Set<string>();return value.flatMap(item=>{if(typeof item!=='string')return [];const alias=item.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120),key=alias.toLocaleLowerCase();if(!alias||seen.has(key))return [];seen.add(key);return [alias];}).slice(0,16);
}
export function cleanSubjectAliases(value:unknown):SubjectAliases{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value).filter(([id])=>/^[1-9]\d{0,9}$/.test(id)).slice(0,1000).flatMap(([id,names])=>{const aliases=cleanAliases(names);return aliases.length?[[id,aliases]]:[];}));
}
export function searchNames(subject:{id:number;name:string;name_cn?:string},aliases:SubjectAliases={}){
 const primary=cleanAliases([subject.name_cn||subject.name,subject.name]),keys=new Set(primary.map(name=>name.toLocaleLowerCase()));
 // Aliases retain priority without removing the official names from the
 // bounded search. A long alias list must not make a previously found show vanish.
 const custom=cleanAliases(aliases[String(subject.id)]).filter(name=>!keys.has(name.toLocaleLowerCase())).slice(0,4-primary.length);
 return [...custom,...primary];
}
