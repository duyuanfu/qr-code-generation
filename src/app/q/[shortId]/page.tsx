import React from 'react';
import { notFound } from 'next/navigation';
import { db, dynamicQrs, scanLogs, eq } from '@/db';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { Download, Film, FileText, CheckCircle2, ShieldCheck, QrCode, AlertCircle, Sparkles } from 'lucide-react';
import { MediaViewer } from '@/components/landing/MediaViewer';
import { ShareButton } from '@/components/landing/ShareButton';
import type { Metadata } from 'next';

interface Props {
  params: {
    shortId: string;
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.shortId === 'preview') {
    return {
      title: '落地页效果预览 - QR Studio',
      description: '扫码落地页预览演示',
    };
  }

  const qr = db.select().from(dynamicQrs).where(eq(dynamicQrs.shortCode, params.shortId)).get();
  if (!qr) return { title: '二维码未找到' };

  return {
    title: `${qr.title} - QR Studio`,
    description: qr.description || '点击查看详情与附件内容',
  };
}

export default async function MobileLandingPage({ params }: Props) {
  const shortCode = params.shortId;

  // Handle preview mode gracefully
  let qr: any;
  let isPreview = false;

  if (shortCode === 'preview') {
    isPreview = true;
    qr = {
      id: 'preview',
      shortCode: 'preview',
      contentType: 'image',
      title: '多媒体扫码落地页 (预览演示)',
      description: '这是系统的扫码预览界面。请在电脑端上传您的实际图片、视频或文件后点击生成专属活码。',
      mediaUrls: JSON.stringify([
        {
          id: 'demo-1',
          name: '示例展示图.jpg',
          url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
          size: 1024 * 1024 * 1.5,
          type: 'image/jpeg',
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
            该二维码可能尚未在电脑端保存生成，或链接已失效。请核对电脑端的活码状态。
          </p>
          <a
            href="/"
            className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition-all"
          >
            返回制作工作台
          </a>
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

  return (
    <main className="min-h-screen bg-slate-100 flex flex-col justify-between items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200/80 my-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/20 backdrop-blur mb-3 shadow-inner">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">{qr.title}</h1>
          {qr.description && (
            <p className="text-xs text-white/80 mt-1.5 leading-relaxed">{qr.description}</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] bg-white/15 px-3 py-1 rounded-full text-white/90">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            <span>官方认证安全链接 · 永久有效</span>
          </div>
        </div>

        {/* Dynamic Media Body */}
        <div className="p-5 flex flex-col gap-5">
          {/* Images or Videos */}
          {(qr.contentType === 'image' || qr.contentType === 'video') && (
            <MediaViewer contentType={qr.contentType} mediaList={mediaList} />
          )}

          {/* 3. Document / File Download */}
          {qr.contentType === 'file' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                附件资料下载 ({mediaList.length})
              </h2>
              <div className="flex flex-col gap-2.5">
                {mediaList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : '文件资源'}
                        </p>
                      </div>
                    </div>
                    <a
                      href={item.url}
                      download={item.name}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
            <ShareButton title={qr.title} description={qr.description} />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100 text-[11px] text-slate-400">
          <span>由 </span>
          <span className="font-semibold text-slate-600">QR Studio</span>
          <span> 提供技术支持 · 不限扫码次数</span>
        </div>
      </div>
    </main>
  );
}
