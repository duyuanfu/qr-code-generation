import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QR Studio - 全能二维码生成与美化工作台',
  description: '支持文字、网址、名片、图片、视频与文件多种内容生成，不限扫码次数与时间，支持批量生成解码与模板美化',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
