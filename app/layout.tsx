import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "零柒番剧 · 让故事随你而行",
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
      <head><link rel="preconnect" href="https://lain.bgm.tv" crossOrigin="anonymous"/><meta name="referrer" content="no-referrer" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
