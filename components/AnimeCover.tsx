'use client';
import {useState} from 'react';
import {coverUrl} from '../lib/cover-url';

export default function AnimeCover({src:original,alt,className='',lazy=false,size='card'}:{src?:string;alt:string;className?:string;lazy?:boolean;size?:'card'|'large'}){
 const src=coverUrl(original,size);
 const [failed,setFailed]=useState<string>();
 return <span className={'anime-cover '+className}>
  {src&&failed!==src?<img key={src} src={src} alt={alt} loading={lazy?'lazy':undefined} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span className="cover-placeholder" role={alt?'img':undefined} aria-label={alt||undefined}>{alt.slice(0,2)||'番剧'}<small>暂无封面</small></span>}
 </span>;
}
