'use client';
import {useState,type RefObject} from 'react';
import {MessageSquare,Settings2,X,RefreshCw} from 'lucide-react';
import {useDanmaku} from './useDanmaku';
import DanmakuOverlay from './DanmakuOverlay';
import {danmakuNames,type DanmakuSettings,type DanmakuSource} from '../lib/danmaku';
export default function DanmakuLayer({media,subjectId,number}:{media:RefObject<HTMLVideoElement|null>;subjectId:number;number:number|undefined}){
 const d=useDanmaku(subjectId,number),[open,setOpen]=useState(false),[link,setLink]=useState('');
 const change=<K extends keyof DanmakuSettings>(key:K,value:DanmakuSettings[K])=>d.setSettings(current=>({...current,[key]:value}));
 return <><DanmakuOverlay media={media} comments={d.comments} settings={d.settings}/>
  <div className="danmaku-switches" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
   <button type="button" aria-label="弹幕开关" aria-pressed={d.settings.enabled} onClick={()=>change('enabled',!d.settings.enabled)}><MessageSquare size={15}/>{d.settings.enabled?'弹幕':'弹幕关'}{d.comments.length>0&&<small>{d.comments.length.toLocaleString()}</small>}</button>
   <button type="button" aria-label="弹幕设置" aria-expanded={open} onClick={()=>setOpen(!open)}><Settings2 size={15}/></button>
  </div>
  {open&&<section className="danmaku-panel" aria-label="弹幕设置面板" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}}}>
   <header><h2>弹幕</h2><button type="button" aria-label="关闭弹幕设置" onClick={()=>setOpen(false)}><X size={17}/></button></header>
   <p role="status" className="danmaku-status">{d.status||('已加载 '+d.comments.length.toLocaleString()+' 条弹幕')}{d.sampled?' · 已按整集均匀精简':''}</p>
   {d.comments.length>0&&<p className="danmaku-caption">{d.isLocal?'本地文件':d.title}{!d.isLocal&&d.episode?' · '+d.episode.title:''}{d.total>d.comments.length?' · 原始 '+d.total.toLocaleString()+' 条':''}</p>}
   <label className="danmaku-field">弹幕匹配<select aria-label="弹幕来源" value={d.selected} onChange={e=>d.choose(e.target.value)}><option value="">选择弹幕来源</option>{d.matches.map(m=><option key={m.provider+':'+m.key} value={m.provider+':'+m.key}>{danmakuNames[m.provider]} · {m.title}</option>)}</select></label>
   {d.episodes.length>0&&<label className="danmaku-field">弹幕分集<select aria-label="弹幕分集" value={d.episode?.id||''} onChange={e=>d.chooseEpisode(e.target.value)}><option value="">请选择对应分集</option>{d.episodes.map(ep=><option key={ep.id} value={ep.id}>{ep.title}</option>)}</select></label>}
   {d.notices.map(n=><p className="danmaku-caption" key={n.provider}>{danmakuNames[n.provider]}：{n.message}</p>)}
   {Object.entries(d.failures).map(([key,message])=><p className="danmaku-caption" key={key}>{danmakuNames[key.split(':')[0] as DanmakuSource]}：{message}</p>)}
   {d.matches.length>1&&<button className="danmaku-reload" type="button" disabled={d.loading||!d.settings.enabled} onClick={d.autoSelect}>{d.automatic?'重新自动选择来源':'自动选择可用来源'}</button>}
   {d.notices.some(n=>n.provider==='dandan'&&!n.configured)&&<p className="danmaku-caption">站长可在<a href="https://dev.dandanplay.com/" target="_blank" rel="noreferrer">弹弹play 开发者中心</a>申请本站应用凭证。访客无需注册弹弹play。</p>}
   <p className="danmaku-caption">来源显示筛选（过滤已加载的弹幕）</p><div className="danmaku-source-filters" aria-label="弹幕来源显示筛选">{(['bilibili','gamer','dandan',...(d.isLocal?['local']:[])] as DanmakuSource[]).map(source=><label key={source}><input type="checkbox" checked={d.settings.sources[source]} onChange={e=>change('sources',{...d.settings.sources,[source]:e.target.checked})}/>{danmakuNames[source]}<small>{d.comments.filter(row=>row[4]===source).length}</small></label>)}</div>
   <div className="danmaku-ranges">
    <label>不透明度 <output>{Math.round(d.settings.opacity*100)}%</output><input aria-label="弹幕不透明度" type="range" min=".2" max="1" step=".05" value={d.settings.opacity} onChange={e=>change('opacity',Number(e.target.value))}/></label>
    <label>字号 <output>{d.settings.fontSize}</output><input aria-label="弹幕字号" type="range" min="16" max="36" step="1" value={d.settings.fontSize} onChange={e=>change('fontSize',Number(e.target.value))}/></label>
    <label>显示区域<select aria-label="弹幕显示区域" value={d.settings.area} onChange={e=>change('area',Number(e.target.value))}><option value={0.25}>上方 1/4</option><option value={0.5}>上半屏</option><option value={0.75}>3/4 屏</option><option value="1">全屏</option></select></label>
    <label>滚动速度<select aria-label="弹幕滚动速度" value={d.settings.speed} onChange={e=>change('speed',Number(e.target.value))}>{[.5,.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
   </div>
   <label className="danmaku-field danmaku-offset">时间偏移（秒）<input aria-label="弹幕时间偏移" type="number" min="-300" max="300" step=".5" value={d.settings.offset} onChange={e=>change('offset',Math.max(-300,Math.min(300,Number(e.target.value)||0)))}/></label>
   <p className="danmaku-caption">正数延后弹幕，负数提前。暂停、跳转和倍速会跟随视频同步。</p>
   <label className="danmaku-field">屏蔽关键词<textarea aria-label="弹幕屏蔽关键词" maxLength={2000} rows={2} value={d.settings.keywords} onChange={e=>change('keywords',e.target.value)} placeholder="每行一个词，或用逗号分隔"/></label>
   <details className="danmaku-manual"><summary>手动匹配 / 导入弹幕</summary><form onSubmit={e=>{e.preventDefault();if(d.manualMatch(link))setLink('');}}><input aria-label="弹幕来源链接" maxLength={300} value={link} onChange={e=>setLink(e.target.value)} placeholder="BiliBili 番剧或 Gamer 链接"/><button type="submit">匹配</button></form><p className="danmaku-caption">核对番剧、季度和分集后再加载。支持 md / ss / ep 标识，也可粘贴 BiliBili XML 弹幕链接（cid）。</p><label className="danmaku-import">导入 XML / JSON<input type="file" accept=".xml,.json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void d.importFile(file);}}/></label>{d.isLocal&&<button type="button" onClick={d.clearImport}>移除本地弹幕</button>}<p role="status" className="danmaku-caption">{d.fileStatus}</p></details>
   <button className="danmaku-reload" type="button" disabled={d.loading||!d.settings.enabled} onClick={d.reload}><RefreshCw size={14} className={d.loading?'spin':''}/>重新获取弹幕</button>
   <p className="danmaku-credit">番剧索引 <a href="https://github.com/bangumi-data/bangumi-data" target="_blank" rel="noreferrer">bangumi-data · CC BY 4.0</a>。弹幕来自所选公开来源；画中画和投屏显示原视频。</p>
  </section>}
 </>;
}
