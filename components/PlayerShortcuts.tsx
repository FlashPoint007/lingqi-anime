'use client';
import {useState} from 'react';
import {defaultPlayerPreferences,shortcutLabels,type PlayerAction,type PlayerPreferences} from '../lib/player-preferences';
export default function PlayerShortcuts({preferences,onChange}:{preferences:PlayerPreferences;onChange:(value:Partial<PlayerPreferences>)=>void}){
 const [listening,setListening]=useState<PlayerAction>(),[message,setMessage]=useState('');
 return <details className="shortcut-settings"><summary>自定义快捷键</summary><div className="shortcut-grid">{(Object.keys(shortcutLabels) as PlayerAction[]).map(action=><label key={action}>{shortcutLabels[action]}<button type="button" aria-label={'设置'+shortcutLabels[action]+'快捷键'} onBlur={()=>setListening(undefined)} onClick={()=>{setListening(action);setMessage('请按字母、数字、空格或方向键；Esc 取消');}} onKeyDown={event=>{
  if(listening!==action)return;event.preventDefault();event.stopPropagation();if(event.code==='Escape'){setListening(undefined);setMessage('');return;}
  if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||!/^(?:Key[A-Z]|Digit\d|Space|Arrow(?:Right|Left|Up|Down))$/.test(event.code)){setMessage('请选择单个字母、数字、空格或方向键');return;}
  if(Object.entries(preferences.shortcuts).some(([key,code])=>key!==action&&code===event.code)){setMessage('这个按键已分配给其他操作，请换一个');return;}
  onChange({shortcuts:{...preferences.shortcuts,[action]:event.code}});setListening(undefined);setMessage('快捷键已保存');
 }}>{listening===action?'等待按键…':preferences.shortcuts[action].replace('Key','').replace('Digit','').replace('Space','空格')}</button></label>)}</div><button type="button" onClick={()=>{onChange({shortcuts:{...defaultPlayerPreferences.shortcuts}});setListening(undefined);setMessage('已恢复默认快捷键');}}>恢复默认按键</button>{message&&<p role="status">{message}</p>}</details>;
}
