import React from 'react';
import { notFound } from 'next/navigation';
import { db, dynamicQrs, scanLogs, eq } from '@/db';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { ShieldCheck, QrCode, AlertCircle } from 'lucide-react';
import { MediaViewer } from '@/components/landing/MediaViewer';
import { ShareButton } from '@/components/landing/ShareButton';
import { isPdfFile } from '@/lib/pdf-helpers';
import { MobilePdfCanvasViewer } from '@/components/landing/MobilePdfCanvasViewer';
import type { Metadata } from 'next';

interface Props {
  params: {
    shortId: string;
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.shortId === 'preview') {
    return {
      title: 'PDF 预览 - QR Studio',
      description: '扫码文档直接查看',
    };
  }

  const qr = db.select().from(dynamicQrs).where(eq(dynamicQrs.shortCode, params.shortId)).get();
  if (!qr) return { title: '二维码未找到' };

  return {
    title: qr.title || 'PDF 预览',
    description: qr.description || '',
  };
}

export default async function MobileLandingPage({ params }: Props) {
  const shortCode = params.shortId;

  let qr: any;
  let isPreview = false;

  if (shortCode === 'preview') {
    isPreview = true;
    qr = {
      id: 'preview',
      shortCode: 'preview',
      contentType: 'pdf',
      title: '演示文档.pdf',
      description: '',
      mediaUrls: JSON.stringify([
        {
          id: 'demo-1',
          name: '演示文档.pdf',
          url: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
          size: 1024 * 1024 * 1.2,
          type: 'application/pdf',
        },
      ]),
    };
  } else {
    qr = db.select().from(dynamicQrs).where(eq(dynamicQrs.shortCode, shortCode)).get();
  }

  if (!qr) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-6 text-center">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-slate-200/80 flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">未找到该二维码内容</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            该二维码可能尚未在电脑端保存生成，或链接已失效。
          </p>
        </div>
      </main>
    );
  }

  // Parse media items
  let mediaList: any[] = [];
  try {
    mediaList = JSON.parse(qr.mediaUrls || '[]');
  } catch (e) {
    mediaList = [];
  }

  // Asynchronous Scan Logging for non-preview
  if (!isPreview) {
    const headersList = headers();
    const userAgent = headersList.get('user-agent') || '';
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '127.0.0.1';

    let device = 'Desktop';
    if (/mobile/i.test(userAgent)) device = 'Mobile';
    if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
    if (/micromessenger/i.test(userAgent)) device = 'WeChat';

    try {
      db.insert(scanLogs)
        .values({
          id: nanoid(12),
          qrId: qr.id,
          scannedAt: new Date(),
          ip,
          userAgent,
          device,
        })
        .run();
    } catch (err) {
      console.error('Failed to log scan:', err);
    }
  }

  // 核心：只要是 pdf 类型，或者上传的文件中包含 pdf，直接整个屏幕全屏纯净展示该 PDF
  // 零边距、零顶部背景、零底部按钮、宽度 100% 贴满手机屏幕
  const pdfItem = qr.contentType === 'pdf' 
    ? mediaList[0] 
    : mediaList.find((m: any) => isPdfFile(m));

  if (pdfItem) {
    return (
      <main className="min-h-screen w-full bg-white m-0 p-0 overflow-x-hidden">
        <MobilePdfCanvasViewer pdfUrl={pdfItem.url} />
      </main>
    );
  }

  // 其他类型（图片/视频/通用文件）的常规兜底展现
  return (
    <main className="min-h-screen bg-slate-100 flex flex-col justify-between items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200/80 my-auto">
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-6 text-white text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/20 backdrop-blur mb-3">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">{qr.title}</h1>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <MediaViewer contentType={qr.contentType} mediaList={mediaList} />
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
            <ShareButton title={qr.title} description={qr.description} />
          </div>
        </div>
      </div>
    </main>
  );
}
