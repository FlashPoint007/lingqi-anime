import type {DanmakuSettings,DanmakuComment} from './danmaku';
export type ConversionMode=DanmakuSettings['conversion'];
type Converter=(text:string)=>string;
const converters=new Map<ConversionMode,Promise<Converter>>();
export function loadDanmakuConverter(mode:ConversionMode):Promise<Converter>{
 if(mode==='none')return Promise.resolve(text=>text);
 const cached=converters.get(mode);if(cached)return cached;
 // Directional bundles stay out of the home page and the default player path.
 const loading=(mode==='simplified'?import('opencc-js/t2cn'):import('opencc-js/cn2t'))
  .then(OpenCC=>OpenCC.Converter(mode==='simplified'?{from:'tw',to:'cn'}:{from:'cn',to:'tw'}))
  .catch(error=>{converters.delete(mode);throw error;});
 converters.set(mode,loading);return loading;
}
export function convertDanmaku(comments:DanmakuComment[],convert:Converter):DanmakuComment[]{
 return comments.map(row=>[row[0],row[1],row[2],convert(row[3]),row[4]]);
}
