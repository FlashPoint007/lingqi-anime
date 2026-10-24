'use client';
import {useEffect,useState} from 'react';
import type {DanmakuComment} from '../lib/danmaku';
import {loadDanmakuConverter,convertDanmaku,type ConversionMode} from '../lib/danmaku-conversion';
export function useDanmakuConversion(comments:DanmakuComment[],mode:ConversionMode,enabled:boolean){
 const [result,setResult]=useState<{input:DanmakuComment[];mode:ConversionMode;comments:DanmakuComment[];error:string}>();
 const active=enabled&&mode!=='none'&&comments.length>0;
 useEffect(()=>{
  if(!active)return;let cancelled=false;
  loadDanmakuConverter(mode).then(convert=>{if(!cancelled)setResult({input:comments,mode,comments:convertDanmaku(comments,convert),error:''});})
   .catch(()=>{if(!cancelled)setResult({input:comments,mode,comments,error:'简繁转换加载失败，暂时显示原文；可切换为不转换后重试。'});});
  return()=>{cancelled=true;};
 },[comments,mode,active]);
 const current=active&&result?.input===comments&&result.mode===mode?result:undefined;
 return {comments:current?.comments||comments,status:!active?'':current?.error||(current?'':'正在准备简繁转换，暂时显示原文…')};
}
