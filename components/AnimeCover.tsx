'use client';
import {useState} from 'react';

export default function AnimeCover({src,alt,className='',lazy=false}:{src?:string;alt:string;className?:string;lazy?:boolean}){
 const [failed,setFailed]=useState<string>();
 return <span className={'anime-cover '+className}>
  {src&&failed!==src?<img key={src} src={src} alt={alt} loading={lazy?'lazy':undefined} referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span className="cover-placeholder" role={alt?'img':undefined} aria-label={alt||undefined}>{alt.slice(0,2)||'番剧'}<small>暂无封面</small></span>}
 </span>;
}
