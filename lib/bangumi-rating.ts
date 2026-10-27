import type {Subject} from './catalog';

// Public Bangumi metadata only; there is deliberately no local rating mutation.
export function bangumiRating(subject:Subject){
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10;
 const score=valid(subject.rating?.score)?subject.rating.score:valid(subject.score)?subject.score:undefined;
 const integer=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0?n:undefined;
 return {score,total:integer(subject.rating?.total),rank:integer(subject.rating?.rank)||integer(subject.rank)};
}
