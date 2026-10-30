'use client';

import React, { useState } from 'react';
import { Download, Film, Maximize2, X, ChevronLeft, ChevronRight, FileText, FileArchive } from 'lucide-react';

interface MediaItem {
  id: string;
  name: string;
  url: string;
  size?: number;
  type?: string;
}

interface MediaViewerProps {
  contentType: 'image' | 'video' | 'pdf' | 'file';
  mediaList: MediaItem[];
}

export const MediaViewer: React.FC<MediaViewerProps> = ({ contentType, mediaList }) => {
  const [activeImageIdx, setActiveImageIdx] = useState<number | null>(null);

  // If inside WeChat browser, we can leverage WeChat native Image Preview
  const handleOpenImage = (idx: number) => {
    if (typeof window !== 'undefined' && (window as any).WeixinJSBridge) {
      const urls = mediaList.map((m) => {
        if (m.url.startsWith('http')) return m.url;
        return `${window.location.origin}${m.url}`;
      });
      (window as any).WeixinJSBridge.invoke('imagePreview', {
        current: urls[idx],
        urls: urls,
      });
      return;
    }
    setActiveImageIdx(idx);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Image Viewer & Gallery */}
      {contentType === 'image' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>图片画廊 ({mediaList.length})</span>
            <span className="text-[10px] text-blue-600 font-normal">点击可放大查看</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mediaList.map((item, idx) => (
              <div
                key={idx}
                className="group relative rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-900/5 shadow-sm transition-all hover:shadow-md"
              >
                <div
                  onClick={() => handleOpenImage(idx)}
                  className="cursor-pointer relative overflow-hidden flex items-center justify-center bg-slate-100 min-h-[180px]"
                >
                  <img
                    src={item.url}
                    alt={item.name || `Image ${idx + 1}`}
                    className="w-full h-auto max-h-72 object-contain transition-transform duration-300 group-hover:scale-102"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-full p-2">
                      <Maximize2 className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="p-3 flex items-center justify-between bg-white border-t border-slate-100">
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[180px]">
                    {item.name || `图片 ${idx + 1}`}
                  </span>
                  <a
                    href={item.url}
                    download={item.name || 'image.png'}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    保存
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Fullscreen Lightbox Modal */}
          {activeImageIdx !== null && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn"
              onClick={() => setActiveImageIdx(null)}
            >
              <button
                onClick={() => setActiveImageIdx(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10"
              >
                <X className="h-6 w-6" />
              </button>

              {activeImageIdx > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIdx(activeImageIdx - 1);
                  }}
                  className="absolute left-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {activeImageIdx < mediaList.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIdx(activeImageIdx + 1);
                  }}
                  className="absolute right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}

              <div
                className="max-w-3xl max-h-[85vh] flex flex-col items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={mediaList[activeImageIdx].url}
                  alt={mediaList[activeImageIdx].name}
                  className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
                />
                <div className="mt-3 flex items-center gap-4 text-white/90 text-xs">
                  <span>{mediaList[activeImageIdx].name}</span>
                  <span>({activeImageIdx + 1} / {mediaList.length})</span>
                  <a
                    href={mediaList[activeImageIdx].url}
                    download={mediaList[activeImageIdx].name}
                    className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white font-medium"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载原图
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Video Player with WeChat & iOS Mobile Compatibility */}
      {contentType === 'video' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>在线高清视频点播</span>
          </div>

          {mediaList.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-2 rounded-2xl overflow-hidden border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="relative rounded-xl overflow-hidden bg-black shadow-inner">
                <video
                  src={item.url}
                  controls
                  preload="metadata"
                  playsInline
                  // WeChat X5 Engine optimization
                  {...({
                    'webkit-playsinline': 'true',
                    'x5-playsinline': 'true',
                    'x5-video-player-type': 'h5-page',
                    'x5-video-orientation': 'portrait',
                  } as any)}
                  className="w-full max-h-96 object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-1 px-1 text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Film className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                    {item.name || '视频演示'}
                  </span>
                </div>

                <a
                  href={item.url}
                  download={item.name || 'video.mp4'}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  保存视频
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Document / Generic File Download */}
      {contentType === 'file' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>附件资料下载 ({mediaList.length})</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {mediaList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden pr-2">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <FileArchive className="h-5 w-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : '文件资源'}
                    </p>
                  </div>
                </div>

                <a
                  href={item.url}
                  download={item.name}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
