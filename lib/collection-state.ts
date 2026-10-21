export const collectionStates={watching:'在看',planned:'想看',completed:'看过',on_hold:'搁置',dropped:'抛弃'} as const;
export type CollectionState=keyof typeof collectionStates;
export function collectionState(value:unknown):CollectionState{return typeof value==='string'&&Object.hasOwn(collectionStates,value)?value as CollectionState:'watching';}
