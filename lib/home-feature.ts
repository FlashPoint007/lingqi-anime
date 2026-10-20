import type {Subject} from './catalog';

// Editorial selection is independent of the browse API's date/rank ordering.
// Keep the identity and local artwork stable while refreshing public metadata.
export const HOME_FEATURE={
 subject:{id:400602,name:'葬送のフリーレン',name_cn:'葬送的芙莉莲',date:'2023-09-29',eps:28,platform:'TV',summary:'勇者一行的冒险结束以后，精灵魔法使芙莉莲踏上了理解人心的新旅程。'} satisfies Subject,
 artwork:'/art/frieren-key-visual.jpg',
 source:'https://frieren-anime.jp/special/gallery/',
 credit:'© 山田鐘人・アベツカサ／小学館／「葬送のフリーレン」製作委員会',
};
