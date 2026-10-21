'use client';
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Search,RefreshCw,X} from 'lucide-react';
import {imageFile,resizeScreenshot,searchScreenshot,sceneTime,type ImageMatch} from '../lib/image-search';
import {timeoutSignal,anySignal} from '../lib/request-client';
export default function ImageSearch({onSearch}:{onSearch:(title:string)=>void}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<ImageMatch[]|null>(null);
 const input=useRef<HTMLInputElement|null>(null),panel=useRef<HTMLDetailsElement|null>(null),request=useRef<AbortController|null>(null),generation=useRef(0),alive=useRef(true);
 const stop=()=>{generation.current++;request.current?.abort();request.current=null;setBusy(false);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;request.current?.abort();};},[]);
 useEffect(()=>{if(!file){setPreview('');return;}const address=URL.createObjectURL(file);setPreview(address);return()=>URL.revokeObjectURL(address);},[file]);
 const choose=(event:React.ChangeEvent<HTMLInputElement>)=>{const picked=event.currentTarget.files?.[0];event.currentTarget.value='';if(!picked)return;stop();setResults(null);try{imageFile(picked);setFile(picked);setError('');}catch(error){setFile(null);setError((error as Error).message);}};
 const search=async()=>{if(!file||busy||request.current)return;const controller=new AbortController(),id=++generation.current;request.current=controller;setBusy(true);setError('');setResults(null);const signal=anySignal([controller.signal,timeoutSignal(45000)]);
  try{const blob=await resizeScreenshot(file,signal);if(id!==generation.current||!alive.current)return;const matches=await searchScreenshot(blob,signal);if(id===generation.current&&alive.current)setResults(matches);}
  catch(error){if(id===generation.current&&alive.current)setError(signal.reason?.name==='TimeoutError'?'识别等待超时，请稍后重试':(error as Error).message||'图片识别失败，请稍后重试');}
  finally{if(id===generation.current&&alive.current){request.current=null;setBusy(false);}}
 };
 return <details ref={panel} className="image-search" onToggle={event=>{if(!event.currentTarget.open)stop();}}><summary><ImagePlus size={16}/>以图搜番<span>用动画截图寻找作品</span></summary><div className="image-search-body">
  <p className="image-search-notice">选择图片后，点击“开始识别”才会将处理后的图片直接发送给 trace.moe。本站不接收或保存图片。请使用清晰的动画截图，海报、同人图可能无法识别。</p>
  <div className="image-search-input">{preview&&<img src={preview} alt="待识别的本机图片预览"/>}<div><button type="button" className="secondary image-search-upload" onClick={()=>input.current?.click()}><ImagePlus size={15}/>选择图片</button><input ref={input} type="file" aria-label="选择待识别的动画截图" accept="image/jpeg,image/png,image/webp" hidden onChange={choose}/><p>{file?file.name:'JPG / PNG / WebP · 最大 5 MB'}</p><div className="button-row"><button className="primary" type="button" disabled={!file||busy} onClick={search}>{busy?<RefreshCw size={15} className="spin"/>:<Search size={15}/>} {busy?'正在识别…':'开始识别'}</button>{busy&&<button className="secondary" type="button" onClick={stop}><X size={14}/>停止识别</button>}{file&&!busy&&<button className="text-button" type="button" onClick={()=>{stop();setFile(null);setResults(null);setError('');}}>清除图片</button>}</div></div></div>
  {error&&<p className="feature-error" role="alert">{error}</p>}{results!==null&&<div className="image-search-results" aria-label="图片识别结果">{results.length?<><p className="muted">找到 {results.length} 个候选。相似度不是确认结论，请核对作品和画面。</p>{results.map((match,index)=><article key={match.id+':'+match.episode}><span className="image-match-index">{String(index+1).padStart(2,'0')}</span><div><h3>{match.displayTitle}</h3>{(match.displayTitle!==match.title||match.alternate!==match.title)&&<p>{match.displayTitle!==match.title?match.title:match.alternate}</p>}<p>{match.episode?'第 '+match.episode+' 集 · ':''}{sceneTime(match.from)}—{sceneTime(match.to)} · 相似度 {(match.similarity*100).toFixed(1)}%{match.similarity<.85?' · 建议仔细核对':''}</p></div><button className="secondary" type="button" onClick={()=>{if(panel.current)panel.current.open=false;onSearch(match.title);}}>用此标题找片</button></article>)}</>:<p role="status">没有找到可展示的匹配作品，试试清晰、无字幕遮挡的原始动画画面。</p>}</div>}
  <p className="footnote">识别由 <a href="https://trace.moe" target="_blank" rel="noreferrer">trace.moe</a> 提供，受其可用性和配额限制。选图本身不会发起识别；不自动读取剪贴板或播放画面。</p>
 </div></details>;
}
