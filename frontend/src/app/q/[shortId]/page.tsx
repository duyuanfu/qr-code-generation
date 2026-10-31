import React, { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Clock } from 'lucide-react';
import { isPdfFile, isImageFile, isVideoFile } from '@/lib/media-kind';
import { MobilePdfCanvasViewer } from '@/components/landing/MobilePdfCanvasViewer';
import { MobileImageViewer } from '@/components/landing/MobileImageViewer';
import { MobileVideoPlayer } from '@/components/landing/MobileVideoPlayer';
import { MobileFileList } from '@/components/landing/MobileFileList';
import { LandingHeader } from '@/components/landing/LandingHeader';
import {
  fetchDynamicQr,
  forwardedScanHeaders,
  parseMediaList,
  type DynamicQrRecord,
} from '@/lib/backend-api';
import type { Metadata } from 'next';

interface Props {
  params: {
    shortId: string;
  };
}

const PREVIEW_RECORD: DynamicQrRecord = {
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

/**
 * 同一次请求内去重加载：generateMetadata 与页面本体都要用这份数据，
 * 而后端在每次 GET 时都会写一条扫码日志 —— 不去重会导致一次访问记两条。
 * React cache 的作用域是「单次请求」，因此在这里包一层即可安全复用。
 */
const loadQr = cache(async (shortCode: string) => {
  const headersList = headers();
  return fetchDynamicQr(shortCode, forwardedScanHeaders((name) => headersList.get(name)));
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.shortId === 'preview') {
    return {
      title: 'PDF 预览 - QR Studio',
      description: '扫码文档直接查看',
    };
  }

  const qr = await loadQr(params.shortId);
  if (!qr) return { title: '二维码未找到' };

  return {
    title: qr.title || 'PDF 预览',
    description: qr.description || '',
  };
}

export default async function MobileLandingPage({ params }: Props) {
  const shortCode = params.shortId;

  let qr: DynamicQrRecord | null = null;

  if (shortCode === 'preview') {
    qr = PREVIEW_RECORD;
  } else {
    // 扫码日志由 Java 后端在 GET /api/qr/dynamic/{shortCode} 时写入，
    // 这里透传真实客户端的 UA 与来源 IP，保证埋点准确。
    qr = await loadQr(shortCode);
  }

  // 走 not-found 边界：既能保留友好提示页，又能返回真正的 404 状态码
  if (!qr) {
    notFound();
  }

  const mediaList = parseMediaList(qr.mediaUrls);

  // 服务有效期（活码为 3 个月；静态码没有这条记录，也不会走到这个页面）
  const expiresAt = qr.expiresAt ? new Date(qr.expiresAt) : null;
  const expired = !!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now();
  const expireText = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleDateString('zh-CN')
    : '';

  /**
   * 渲染策略：类型（contentType）决定用哪种版式，文件本身决定这个版式能不能用。
   *
   * - 用户给「文件」类型时，不管里面装的是 PDF 还是图片，一律按文件资源管理器展示，
   *   因为这类活码买的就是「一堆附件 + 下载」，不是在线阅读。
   * - 反过来说，类型和实际文件对不上时（历史脏数据、或切换类型把上一类文件带了进来），
   *   宁可退化成文件列表，也绝不拿 mp4 去喂 pdf.js —— 那会直接白屏。
   */
  const pdfItem = mediaList.find((m) => isPdfFile(m));
  const imageItems = mediaList.filter((m) => isImageFile(m));
  const videoItems = mediaList.filter((m) => isVideoFile(m));

  const showPdf = qr.contentType === 'pdf' && !!pdfItem;
  const showGallery = qr.contentType === 'image' && imageItems.length > 0;
  const showVideo = qr.contentType === 'video' && videoItems.length > 0;

  /** 到期提示：浮在内容之上，不占布局、不打断阅读 */
  const expiryPill = expired ? (
    <div className="pointer-events-none fixed left-1/2 top-[calc(var(--landing-header-h)+0.5rem)] z-40 -translate-x-1/2 rounded-full bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
      服务已于 {expireText} 到期，请联系制作者续费
    </div>
  ) : null;

  // ① PDF：整屏纯净展示，顶部只留一条品牌栏
  if (showPdf && pdfItem) {
    return (
      <main className="min-h-screen w-full overflow-x-hidden bg-white m-0 p-0">
        <LandingHeader />
        <div className="pt-landing-header">
          <MobilePdfCanvasViewer pdfUrl={pdfItem.url} />
        </div>
        {expiryPill}
      </main>
    );
  }

  // ② 图片：零骨架、铺满屏宽，每张图右下角可直接保存
  if (showGallery) {
    return (
      <main className="min-h-screen w-full overflow-x-hidden bg-white m-0 p-0">
        <LandingHeader />
        <div className="pt-landing-header">
          <MobileImageViewer items={imageItems} title={qr.title} />
        </div>
        {expiryPill}
      </main>
    );
  }

  // ③ 视频：纯黑底、铺满屏宽、控件用系统原生，右上角带下载
  if (showVideo) {
    return (
      <main className="min-h-screen w-full overflow-x-hidden bg-black m-0 p-0">
        <LandingHeader variant="dark" />
        <div className="pt-landing-header">
          <MobileVideoPlayer items={videoItems} title={qr.title} />
        </div>
        {expiryPill}
      </main>
    );
  }

  // ④ 文件 / 附件：像文件资源管理器一样一行一个，整行可点下载
  return (
    <main className="min-h-screen bg-slate-50">
      <LandingHeader />
      <div className="pt-landing-header">
        <div className="mx-auto w-full max-w-2xl">
          <div className="px-4 pb-1 pt-4">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {qr.title || '文件下载'}
            </h1>
            {qr.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{qr.description}</p>
            ) : null}
          </div>

          {expired && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>该二维码服务已于 {expireText} 到期，请联系制作者续费，以免后续无法访问。</span>
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <MobileFileList items={mediaList} />
          </div>

          <p className="px-4 py-5 pb-safe text-center text-xs text-slate-500">
            点击任意文件即可下载 · 长按也可保存
          </p>
        </div>
      </div>
    </main>
  );
}
