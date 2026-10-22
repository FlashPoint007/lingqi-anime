'use client';
import {useState} from 'react';
import {Share2} from 'lucide-react';
import {siteShareURL} from '../lib/share-links';
export default function ShareButton({hash,label='分享链接'}:{hash:string;label?:string}){
 const [message,setMessage]=useState(''),[manual,setManual]=useState('');
 return <span className="share-control"><button type="button" className="text-button" onClick={async()=>{const url=siteShareURL(hash);try{await navigator.clipboard.writeText(url);setManual('');setMessage('链接已复制');}catch{setManual(url);setMessage('可复制下方链接');}}}><Share2 size={14}/>{label}</button>{message&&<small role="status">{message}</small>}{manual&&<input aria-label="手动复制分享链接" readOnly value={manual} onFocus={e=>e.currentTarget.select()}/>}</span>;
}
