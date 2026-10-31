'use client';

import React, { useEffect, useState } from 'react';
import { X, Download, ExternalLink, FileText, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  title: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  title,
}) => {
  const [scale, setScale] = useState<number>(100);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Ensure absolute URL if needed
  const resolvedUrl = pdfUrl.startsWith('http')
    ? pdfUrl
    : typeof window !== 'undefined'
    ? `${window.location.origin}${pdfUrl}`
    : pdfUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      {/* Top Navigation & Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-700/80 bg-slate-900/90 px-4 text-white">
        <div className="flex items-center gap-2 overflow-hidden pr-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="truncate text-xs sm:text-sm font-semibold max-w-[180px] sm:max-w-md">
            {title || 'PDF 文档在线阅读'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            title="在新窗口打开"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>

          <a
            href={resolvedUrl}
            download={title || 'document.pdf'}
            title="下载原件"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">下载</span>
          </a>

          <button
            onClick={onClose}
            aria-label="关闭预览"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors ml-1"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main PDF Frame Reader Area */}
      <main className="relative flex-1 w-full bg-slate-800/60 overflow-hidden flex flex-col items-center justify-center">
        <iframe
          src={`${resolvedUrl}#toolbar=1&navpanes=0&scrollbar=1`}
          className="h-full w-full border-none bg-white shadow-2xl"
          title={title}
        />

        {/* Fallback & Hint Bar for mobile browsers with restricted iframes */}
        <div className="w-full bg-slate-900/90 py-1.5 px-4 text-center text-[11px] text-slate-400 border-t border-slate-800 flex items-center justify-center gap-3">
          <span>如遇特定浏览器无法直接翻阅，可选择：</span>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5"
          >
            新窗口极速打开 <ExternalLink className="h-3 w-3 inline" aria-hidden="true" />
          </a>
        </div>
      </main>
    </div>
  );
};
