'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MobilePdfCanvasViewerProps {
  pdfUrl: string;
}

/**
 * pdf.js 走同源静态资源（`public/vendor/pdfjs/`，由 next.config 打上 immutable 缓存）。
 *
 * 之前用的是 cdn.bootcdn.net，但那家返回
 * `Cache-Control: no-cache, no-store, must-revalidate`，等于每次扫码都要
 * 重下 1.4 MB（主包 320 KB + worker 1.06 MB）。实测本地到 CDN 只有 124 KB/s，
 * 光 worker 就 8.5 秒，整个首屏 12.8 秒 —— 而且第二次打开一分不省。
 * 自托管后这块归零，只剩本地静态文件的 304/内存命中。
 */
const PDFJS_BASE = '/vendor/pdfjs';
const PDFJS_SRC = `${PDFJS_BASE}/pdf.min.js`;
const WORKER_SRC = `${PDFJS_BASE}/pdf.worker.min.js`;
const CMAP_URL = `${PDFJS_BASE}/cmaps/`;

/**
 * Retina 屏上 2 倍已经看不出锯齿，再往上只是把位图翻倍。
 * 之前不封顶：DPR 3 时 49 页 × 1170×1654 ≈ 362 MB canvas 位图，
 * iOS 会白页甚至整页重载；DPR 4 的机器直接到 640 MB。
 */
const MAX_DPR = 2;

/** 视口外提前 800px 开始画，快速下滑时不会看到大片留白 */
const PRELOAD_MARGIN = '800px 0px';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib?: any;
  }
}

/** 只插一次 script，并发调用共用同一个 promise */
function loadPdfJs(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);

  const existing = document.querySelector<HTMLScriptElement>('script[data-pdfjs-loader]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.pdfjsLib));
      existing.addEventListener('error', () => reject(new Error('pdf.js 加载失败')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.async = true;
    script.dataset.pdfjsLoader = '1';
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = () => reject(new Error('pdf.js 加载失败'));
    document.head.appendChild(script);
  });
}

/** pdf.js 没有随工程引入类型（走的是同源 UMD 包），这里只声明用到的那一小部分 */
interface PdfPageLike {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
  }) => { promise: Promise<void> };
}

interface PdfDocLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
}

interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfDocLike> };
}

export const MobilePdfCanvasViewer: React.FC<MobilePdfCanvasViewerProps> = ({ pdfUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * 仅在「宽度真的变了」时更新（横竖屏切换）。
   * 移动端地址栏收起也会触发 resize，但那只改高度，跟着重画等于白烧一遍 CPU。
   */
  const [layoutWidth, setLayoutWidth] = useState(0);

  useEffect(() => {
    const onResize = () => {
      const w = document.documentElement.clientWidth;
      setLayoutWidth((prev) => (Math.abs(prev - w) > 4 ? w : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const container = containerRef.current;

    const run = async () => {
      setLoading(true);
      setError(null);
      if (!container) return;
      container.replaceChildren();

      try {
        const lib = (await loadPdfJs()) as PdfJsLike;
        if (cancelled) return;

        lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

        const pdf = await lib.getDocument({
          url: pdfUrl,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
        }).promise;
        if (cancelled || !container) return;

        // 所有页面统一按第一页的宽高比先占位，保证滚动条长度一开始就是对的
        const firstPage = await pdf.getPage(1);
        if (cancelled) return;
        const baseViewport = firstPage.getViewport({ scale: 1 });
        const cssWidth = container.clientWidth || window.innerWidth;
        const scale = cssWidth / baseViewport.width;
        const placeholderHeight = baseViewport.height * scale;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

        const holders: HTMLDivElement[] = [];
        /** 已画过的页不再重复排队；渲染失败时从集合里删掉，滚回来还能重试 */
        const painted = new Set<number>();

        const renderPage = async (index: number) => {
          if (cancelled || painted.has(index)) return;
          const holder = holders[index];
          if (!holder) return;
          painted.add(index);

          try {
            const page = index === 0 ? firstPage : await pdf.getPage(index + 1);
            if (cancelled) return;

            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto';

            const context = canvas.getContext('2d');
            if (!context) return;
            context.scale(dpr, dpr);

            // 页面尺寸和首页不同时（横竖混排）在这里纠正占位高度
            holder.style.height = `${viewport.height}px`;
            holder.replaceChildren(canvas);

            await page.render({ canvasContext: context, viewport }).promise;
            if (cancelled) return;

            // 首屏画完才撤加载遮罩：之前是 getDocument 一 resolve 就撤，
            // 用户看到的是纯白页，体感上「解析慢」有一半来自这里
            if (index === 0) setLoading(false);
          } catch (err) {
            painted.delete(index);
            if (index === 0 && !cancelled) {
              console.error('PDF first page render failed:', err);
              setError('文档解析中，请点击下方直接全屏打开');
              setLoading(false);
            }
          }
        };

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const index = Number((entry.target as HTMLElement).dataset.pageIndex);
              if (Number.isFinite(index)) void renderPage(index);
            }
          },
          { rootMargin: PRELOAD_MARGIN, threshold: 0 },
        );

        for (let i = 0; i < pdf.numPages; i++) {
          const holder = document.createElement('div');
          holder.dataset.pageIndex = String(i);
          holder.style.height = `${placeholderHeight}px`;
          holder.className = 'w-full bg-white';
          container.appendChild(holder);
          holders.push(holder);
          observer.observe(holder);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('PDF rendering failed:', err);
        setError('文档解析中，请点击下方直接全屏打开');
        setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      observer?.disconnect();
      container?.replaceChildren();
    };
  }, [pdfUrl, layoutWidth]);

  return (
    <div className="w-full min-h-screen bg-white flex flex-col items-center m-0 p-0 overflow-x-hidden">
      {/* Loading state */}
      {loading && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
          <div className="h-9 w-9 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin mb-3" />
          <span className="text-xs text-slate-500 font-medium">正在加载高清文档...</span>
        </div>
      )}

      {/* Fallback link if rendering error occurs */}
      {error && (
        <div className="p-8 flex flex-col items-center text-center my-auto">
          <p className="text-sm text-slate-700 mb-3">{error}</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm"
          >
            直接全屏打开 PDF
          </a>
        </div>
      )}

      {/* Pages Container - 100% Screen Width, Zero Padding */}
      <div ref={containerRef} className="w-full flex flex-col m-0 p-0" />
    </div>
  );
};
