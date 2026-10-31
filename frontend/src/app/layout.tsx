import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientAuthWrapper } from '@/components/auth/ClientAuthWrapper';

export const metadata: Metadata = {
  title: 'QR Studio - 全能二维码生成与美化工作台',
  description: '支持文字、网址、名片、图片、视频与文件多种内容生成，不限扫码次数与时间，支持批量生成解码与模板美化',
};

/**
 * viewport-fit=cover 是 iOS 上安全区生效的前提。
 * 不加它，`env(safe-area-inset-*)` 恒为 0，刘海/底部 Home 条会直接压住固定栏和操作按钮。
 *
 * maximumScale 不锁死：允许用户双指放大（WCAG 1.4.4），
 * 落地页有 PDF、图片这类必须能放大的内容，禁缩放是明显的无障碍缺陷。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        <ClientAuthWrapper>
          {children}
        </ClientAuthWrapper>
      </body>
    </html>
  );
}
