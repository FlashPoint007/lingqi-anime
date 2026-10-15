'use client';
export default function ErrorPage({reset}:{reset:()=>void}){
 return <main className="empty" role="alert"><h1>页面加载遇到问题</h1><p>请重新尝试；也可以返回首页继续查找番剧。</p><div className="button-row"><button className="primary" onClick={reset}>重新尝试</button><a className="secondary" href="/">返回首页</a></div></main>;
}
