'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MobilePdfCanvasViewerProps {
  pdfUrl: string;
}

export const MobilePdfCanvasViewer: React.FC<MobilePdfCanvasViewerProps> = ({ pdfUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadScript = (src: string) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

    const loadAndRenderPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load pdfjs from high-speed domestic mirror first, fallback to cloudflare
        if (!(window as any).pdfjsLib) {
          try {
            await loadScript('https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          } catch (e) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          }
        }

        const pdfjsLib = (window as any).pdfjsLib;
        // Bootcdn worker fallback
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Fetch and load PDF with Chinese character cmap support
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: 'https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        setLoading(false);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Device pixel ratio for crisp high-DPI text rendering on mobile Retina/OLED
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

          // Set CSS display width to exact screen width
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto';

          // Set buffer pixel dimensions scaled by DPR
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
          setError('文档解析中，请点击下方直接全屏打开');
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
    <div className="w-full min-h-screen bg-white flex flex-col items-center m-0 p-0 overflow-x-hidden">
      {/* Loading state */}
      {loading && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
          <div className="h-9 w-9 rounded-full border-3 border-blue-600 border-t-transparent animate-spin mb-3" />
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
