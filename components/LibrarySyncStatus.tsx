'use client';
import {Cloud,RefreshCw} from 'lucide-react';
type Props={phase:string;message:string;account?:{displayName:string};retry:()=>void;flush:()=>unknown};
export default function LibrarySyncStatus(p:Props){
 return <section className={'library-sync '+p.phase} aria-label="个人数据同步"><Cloud size={17}/><div><b>{p.account?'数据库同步 · '+p.account.displayName:p.phase==='checking'?'正在读取个人空间':'登录后保存到数据库'}</b><p role={p.phase==='error'?'alert':'status'}>{p.message}</p></div><div className="library-sync-actions">{p.account?<><button type="button" className="secondary" disabled={p.phase==='saving'} onClick={p.retry}><RefreshCw size={13} className={p.phase==='saving'?'spin':''}/>同步</button><a href="/signout-with-chatgpt?return_to=%2F" target="_top" onClick={()=>void p.flush()}>退出登录</a></>:<><a className="secondary" href="/signin-with-chatgpt?return_to=%2F" target="_top">登录并同步</a>{p.phase==='error'&&<button type="button" onClick={p.retry}>重试</button>}</>}</div></section>;
}
