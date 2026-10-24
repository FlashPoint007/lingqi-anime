'use client';
import type {DanmakuSettings} from '../lib/danmaku';
import {useMemo,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import DanmakuComposer from './DanmakuComposer';
import {useSiteDanmaku} from './useSiteDanmaku';
import {siteDanmakuComments,type DanmakuSession} from '../lib/site-danmaku';
import {MessageSquare,Settings2,X,RefreshCw} from 'lucide-react';
import {useDanmaku} from './useDanmaku';
import DanmakuBlocks from './DanmakuBlocks';
import {advancedDanmaku} from '../lib/danmaku-blocks';
import DanmakuOverlay from './DanmakuOverlay';
import {useDanmakuConversion} from './useDanmakuConversion';
import {danmakuNames,type DanmakuSource} from '../lib/danmaku';
export default function DanmakuLayer({media,subjectId,number,danmakuPreferences,onDanmakuPreferences,danmakuSync,danmakuSession,composerHost,mayResume}:{danmakuPreferences?:DanmakuSettings;onDanmakuPreferences?:(settings:DanmakuSettings)=>void;danmakuSync?:string;danmakuSession?:DanmakuSession;composerHost:RefObject<HTMLElement|null>;mayResume:()=>boolean;media:RefObject<HTMLVideoElement|null>;subjectId:number;number:number|undefined}){
 const d=useDanmaku(subjectId,number,danmakuPreferences,onDanmakuPreferences),[open,setOpen]=useState(false),[link,setLink]=useState(''),[composer,setComposer]=useState(false),[sent,setSent]=useState('');
 const site=useSiteDanmaku(subjectId,number,media,d.settings.enabled&&d.settings.sources.site,danmakuSession);
 const comments=useMemo(()=>[...d.comments,...siteDanmakuComments(site.posts,d.settings.offset)].sort((a,b)=>a[0]-b[0]),[d.comments,site.posts,d.settings.offset]);
 // Filter the original and displayed text so conversion cannot undo blocking.
 const eligible=useMemo(()=>advancedDanmaku(comments,d.settings),[comments,d.settings]);
 const converted=useDanmakuConversion(eligible,d.settings.conversion,d.settings.enabled);
 const change=<K extends keyof DanmakuSettings>(key:K,value:DanmakuSettings[K])=>d.setSettings(current=>({...current,[key]:value}));
 return <><DanmakuOverlay media={media} comments={converted.comments} settings={d.settings}/>
  <div className="danmaku-switches" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
   <button type="button" aria-label="弹幕开关" aria-pressed={d.settings.enabled} onClick={()=>change('enabled',!d.settings.enabled)}><MessageSquare size={15}/>{d.settings.enabled?'弹幕':'弹幕关'}{comments.length>0&&<small>{comments.length.toLocaleString()}</small>}</button>
   <button type="button" aria-label="弹幕设置" aria-expanded={open} disabled={composer} onClick={()=>setOpen(!open)}><Settings2 size={15}/></button>
   <button type="button" aria-label="发送本站弹幕" aria-expanded={composer} disabled={composer} onClick={()=>{setOpen(false);setComposer(true);setSent('');}}>{composer?'编辑中':'发弹幕'}</button>{sent&&<span className="danmaku-sent-status" role="status">{sent}</span>}
  </div>
  {composer&&composerHost.current&&createPortal(<DanmakuComposer key={subjectId+':'+number+':'+(danmakuSession?.owner||'anonymous')} media={media} subjectId={subjectId} number={number} session={danmakuSession} pauseOnEdit={d.settings.pauseOnEdit} onPauseOnEdit={value=>change('pauseOnEdit',value)} mayResume={mayResume} onClose={()=>setComposer(false)} onSent={post=>{site.add(post);setSent('已发送'+(!d.settings.enabled||!d.settings.sources.site?' · 本机显示已关闭':''));setComposer(false);}} onRemoved={site.remove}/>,composerHost.current)}
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
   <p className="danmaku-caption">来源显示筛选（过滤已加载的弹幕）</p><div className="danmaku-source-filters" aria-label="弹幕来源显示筛选">{(['site','bilibili','gamer','dandan',...(d.isLocal?['local']:[])] as DanmakuSource[]).map(source=><label key={source}><input type="checkbox" checked={d.settings.sources[source]} onChange={e=>change('sources',{...d.settings.sources,[source]:e.target.checked})}/>{danmakuNames[source]}<small>{comments.filter(row=>row[4]===source).length}</small></label>)}</div><p className="danmaku-caption" role="status">{site.status} <button type="button" onClick={site.refresh}>刷新本站弹幕</button></p>
   <p className="danmaku-caption">弹幕类型</p><div className="danmaku-source-filters" aria-label="弹幕类型筛选">{(['scroll','top','bottom'] as const).map(mode=><label key={mode}><input type="checkbox" checked={d.settings.modes[mode]} onChange={e=>change('modes',{...d.settings.modes,[mode]:e.target.checked})}/>{{scroll:'滚动弹幕',top:'顶部弹幕',bottom:'底部弹幕'}[mode]}</label>)}</div>
   <div className="danmaku-source-filters"><label><input type="checkbox" checked={d.settings.color} onChange={e=>change('color',e.target.checked)}/>保留弹幕颜色</label><label><input type="checkbox" checked={d.settings.deduplicate} onChange={e=>change('deduplicate',e.target.checked)}/>合并 10 秒内相同弹幕</label></div><label className="danmaku-field">简繁转换<select aria-label="弹幕简繁转换" value={d.settings.conversion} onChange={e=>change('conversion',e.target.value as DanmakuSettings['conversion'])}><option value="none">不转换</option><option value="simplified">转为简体</option><option value="traditional">转为繁体</option></select></label><p className="danmaku-caption">仅转换本机显示文字，原始弹幕与发送内容保留；登录后同步此偏好。</p>{converted.status&&<p className="danmaku-caption" role="status">{converted.status}</p>}<p className="danmaku-caption">过滤后可显示 {advancedDanmaku(converted.comments,d.settings).length.toLocaleString()} 条；更改不会重新请求片源。</p>
   <div className="danmaku-ranges">
    <label>不透明度 <output>{Math.round(d.settings.opacity*100)}%</output><input aria-label="弹幕不透明度" type="range" min=".2" max="1" step=".05" value={d.settings.opacity} onChange={e=>change('opacity',Number(e.target.value))}/></label>
    <label>字号 <output>{d.settings.fontSize}</output><input aria-label="弹幕字号" type="range" min="16" max="36" step="1" value={d.settings.fontSize} onChange={e=>change('fontSize',Number(e.target.value))}/></label>
    <label>显示区域<select aria-label="弹幕显示区域" value={d.settings.area} onChange={e=>change('area',Number(e.target.value))}><option value={0.25}>上方 1/4</option><option value={0.5}>上半屏</option><option value={0.75}>3/4 屏</option><option value="1">全屏</option></select></label>
    <label>滚动速度<select aria-label="弹幕滚动速度" value={d.settings.speed} onChange={e=>change('speed',Number(e.target.value))}>{[.5,.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
   </div>
   <label className="danmaku-field danmaku-offset">时间偏移（秒）<input aria-label="弹幕时间偏移" type="number" min="-300" max="300" step=".5" value={d.settings.offset} onChange={e=>change('offset',Math.max(-300,Math.min(300,Number(e.target.value)||0)))}/></label>
   <p className="danmaku-caption">正数延后上游弹幕，负数提前；本站弹幕使用实际视频时间。暂停、跳转和倍速会跟随视频同步。</p><label className="danmaku-caption"><input type="checkbox" checked={d.settings.pauseOnEdit} onChange={e=>change('pauseOnEdit',e.target.checked)}/>编辑本站弹幕时暂停播放</label>
   <label className="danmaku-field">屏蔽关键词<textarea aria-label="弹幕屏蔽关键词" maxLength={2000} rows={2} value={d.settings.keywords} onChange={e=>change('keywords',e.target.value)} placeholder="每行一个词，或用逗号分隔"/></label>
   <DanmakuBlocks settings={d.settings} onChange={d.setSettings} sync={danmakuSync}/><details className="danmaku-manual"><summary>手动匹配 / 导入弹幕</summary><form onSubmit={e=>{e.preventDefault();if(d.manualMatch(link))setLink('');}}><input aria-label="弹幕来源链接" maxLength={300} value={link} onChange={e=>setLink(e.target.value)} placeholder="BiliBili 番剧或 Gamer 链接"/><button type="submit">匹配</button></form><p className="danmaku-caption">核对番剧、季度和分集后再加载。支持 md / ss / ep 标识，也可粘贴 BiliBili XML 弹幕链接（cid）。</p><label className="danmaku-import">导入 XML / JSON<input type="file" accept=".xml,.json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void d.importFile(file);}}/></label>{d.isLocal&&<button type="button" onClick={d.clearImport}>移除本地弹幕</button>}<p role="status" className="danmaku-caption">{d.fileStatus}</p></details>
   <button className="danmaku-reload" type="button" disabled={d.loading||!d.settings.enabled} onClick={d.reload}><RefreshCw size={14} className={d.loading?'spin':''}/>重新获取弹幕</button>
   <p className="danmaku-credit">番剧索引 <a href="https://github.com/bangumi-data/bangumi-data" target="_blank" rel="noreferrer">bangumi-data · CC BY 4.0</a>。弹幕来自所选公开来源；画中画和投屏显示原视频。</p>
  </section>}
 </>;
}
