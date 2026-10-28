export type EmailAction={action:'register'|'reset'|'verify';token:string};
// Fragments are never sent in HTTP URLs or Referrer headers. Consume them only in component memory.
export function parseEmailAction(hash:string):EmailAction|undefined{
 if(hash.length>200)return;
 const params=new URLSearchParams(hash.replace(/^#/,'')),action=params.get('action'),token=params.get('token');
 if(!['register','reset','verify'].includes(action||'')||!token||!/^[a-f0-9]{64}$/.test(token)||params.getAll('action').length!==1||params.getAll('token').length!==1)return;
 return {action:action as EmailAction['action'],token};
}
