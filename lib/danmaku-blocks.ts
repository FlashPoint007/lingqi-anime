import {RE2JS} from 're2js';
import {filteredDanmaku,type DanmakuSettings,type DanmakuComment} from './danmaku';
let cached='',compiled:RE2JS[]=[],errors:string[]=[];
export function compileDanmakuBlocks(text:string){
 if(text===cached)return {patterns:compiled,errors};cached=text;compiled=[];errors=[];
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(lines.length>32)errors.push('最多使用 32 条正则规则');
 for(const [index,line] of lines.slice(0,32).entries())try{
  if(line.length>64)throw Error('每条最多 64 字符');const match=line.match(/^\/(.*)\/([i]?)$/),pattern=match?match[1]:line,flags=match?.[2]==='i'?RE2JS.CASE_INSENSITIVE:0;
  const re=RE2JS.compile(pattern,flags);if(re.programSize()>512)throw Error('规则过于复杂，请缩小重复次数');compiled.push(re);
 }catch{errors.push('第 '+(index+1)+' 条规则无效或过于复杂（不支持回溯引用和前后查找）');}
 return {patterns:compiled,errors};
}
function repeated(text:string){let last='',count=0;for(const char of text){count=char===last?count+1:1;if(count>=8)return true;last=char;}return false;}
export function advancedDanmaku(comments:DanmakuComment[],settings:DanmakuSettings){const {patterns}=compileDanmakuBlocks(settings.regexPatterns||'');return filteredDanmaku(comments,settings).filter(row=>row[3].length<=(settings.maxLength||180)&&!(settings.blockRepetition&&repeated(row[3]))&&!patterns.some(pattern=>pattern.matcher(row[3]).find()));}
