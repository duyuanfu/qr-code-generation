'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MobilePdfCanvasViewerProps {
  pdfUrl: string;
}

export const MobilePdfCanvasViewer: React.FC<MobilePdfCanvasViewerProps> = ({ pdfUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const loadAndRenderPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load pdfjs from high-speed reliable CDN
        if (!(window as any).pdfjsLib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load PDF engine'));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Fetch and load PDF
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        setTotalPages(pdf.numPages);
        setLoading(false);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Device pixel ratio for crisp high-DPI text rendering on mobile
        const dpr = window.devicePixelRatio || 1;
        const screenWidth = window.innerWidth;

        // Render every page directly into high-res Canvas, full-width with zero margins
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (isCancelled) return;
          const page = await pdf.getPage(pageNum);

          const unscaledViewport = page.getViewport({ scale: 1 });
          // Scale so page width equals 100% of phone screen width
          const scale = screenWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          // Set display size to screen width
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto';

          // Set actual render buffer scaled by DPR for razor-sharp rendering on Retina/OLED
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);

          context.scale(dpr, dpr);

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          container.appendChild(canvas);
          await page.render(renderContext).promise;
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('PDF rendering failed:', err);
          setError('PDF 加载中，请点击下方直接打开');
          setLoading(false);
        }
      }
    };

    loadAndRenderPdf();

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl]);

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col items-center m-0 p-0 overflow-x-hidden">
      {/* Loading state */}
      {loading && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
          <div className="h-9 w-9 rounded-full border-3 border-blue-600 border-t-transparent animate-spin mb-3" />
          <span className="text-xs text-slate-500 font-medium">正在解析文档内容...</span>
        </div>
      )}

      {/* Fallback if CDN blocked */}
      {error && (
        <div className="p-8 flex flex-col items-center text-center my-auto">
          <p className="text-sm text-slate-700 mb-3">{error}</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
          >
            直接全屏打开 PDF
          </a>
        </div>
      )}

      {/* Pages Container - Exact Screen Width */}
      <div ref={containerRef} className="w-full flex flex-col m-0 p-0" />
    </div>
  );
};
