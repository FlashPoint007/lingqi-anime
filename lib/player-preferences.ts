export type VideoFit='contain'|'cover'|'fill';
export type PlayerPreferences={seekStep:number;skipSeconds:number;fit:VideoFit};
export const defaultPlayerPreferences:PlayerPreferences={seekStep:10,skipSeconds:90,fit:'contain'};
export function playerPreferences(value:unknown):PlayerPreferences{const v=value as Partial<PlayerPreferences>|null;return {seekStep:typeof v?.seekStep==='number'&&Number.isInteger(v.seekStep)&&v.seekStep>=1&&v.seekStep<=120?v.seekStep:10,skipSeconds:typeof v?.skipSeconds==='number'&&Number.isInteger(v.skipSeconds)&&v.skipSeconds>=5&&v.skipSeconds<=600?v.skipSeconds:90,fit:['contain','cover','fill'].includes(v?.fit||'')?v!.fit!:'contain'};}
