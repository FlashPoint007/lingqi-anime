import type { Metadata } from "next";
import "./globals.css";
import "./anime-theme.css";
import "./watch-theme.css";
import "./feature-theme.css";
import "./watch-features.css";
import "./danmaku-composer.css";

export const metadata: Metadata = {
  title: "零柒番剧 · 动画索引与追番",
  description: "发现番剧、管理追番与自定义规则，浏览器中的零柒番剧。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><link rel="preconnect" href="https://lain.bgm.tv" crossOrigin="anonymous"/><meta name="referrer" content="no-referrer" /><script src="/startup-recovery.js" defer /></head>
      <body className="antialiased">{children}<aside id="startup-recovery" hidden role="status" style={{position:'fixed',left:16,right:16,bottom:16,zIndex:1000,maxWidth:600,margin:'0 auto',padding:18,border:'1px solid #bdb9a9',borderRadius:8,background:'#fffdf7',color:'#32463f',boxShadow:'0 4px 24px #0002',fontSize:14,lineHeight:1.7}}><p style={{margin:'0 0 10px'}}>页面交互尚未加载完成，请检查网络后刷新重试。本机追番和观看记录会保留。</p><button id="startup-retry" type="button" style={{padding:'7px 14px',border:'1px solid #45615b',borderRadius:5,background:'#45615b',color:'#fffdf7',font:'inherit',cursor:'pointer'}}>刷新页面</button></aside></body>
    </html>
  );
}
