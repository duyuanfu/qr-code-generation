'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';

interface MediaItem {
  id?: string;
  name?: string;
  url: string;
  size?: number;
  type?: string;
}

interface MobileVideoPlayerProps {
  items: MediaItem[];
  title?: string;
}

/**
 * 单条视频：预加载期给 16:9 占位，解码失败给明确提示。
 *
 * 没有占位时，<video> 在 metadata 到达前高度几乎为 0，
 * 拿到尺寸后猛地撑开会让页面向上跳一大截。
 * 没有 onError 时，被清理掉的老文件只会留一块纯黑区域，用户以为是页面卡了。
 */
const VideoTile: React.FC<{ item: MediaItem; idx: number; title?: string }> = ({ item, idx, title }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 bg-neutral-900 px-6 py-16 text-neutral-400" style={{ aspectRatio: '16 / 9' }}>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="m10 9 5 3-5 3V9Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs">这条视频暂时无法播放</span>
        <a href={item.url} download={item.name || `video-${idx + 1}.mp4`} className="mt-1 text-xs font-medium text-white/85 underline underline-offset-2">
          尝试直接下载
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-black">
      <video
        src={item.url}
        controls
        preload={idx === 0 ? 'metadata' : 'none'}
        playsInline
        // 微信 X5 内核参数：不进原生全屏播放器、竖屏、不进画中画
        {...({
          'webkit-playsinline': 'true',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5-page',
          'x5-video-orientation': 'portrait',
        } as any)}
        className="block max-h-app w-full bg-black object-contain"
        aria-label={item.name || title || `视频 ${idx + 1}`}
        onError={() => setFailed(true)}
      />
      <a
        href={item.url}
        download={item.name || `video-${idx + 1}.mp4`}
        aria-label={`下载${item.name || `视频 ${idx + 1}`}`}
        className="absolute right-2 top-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-black/55 px-3 text-[11px] font-medium text-white/90 backdrop-blur active:bg-black/75"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        下载
      </a>
    </div>
  );
};

/**
 * 视频落地页：和 PDF 查看器一致的零骨架体验。
 *
 * - 纯黑底、视频铺满屏宽、不画卡片、不写「在线高清视频点播」这类装饰。
 * - 控件交给系统原生播放器（iOS/安卓/微信 X5 都自带播放、进度、全屏、音量）。
 * - 保留 X5 的 `x5-video-player-type="h5-page"`：否则微信会拉起自带的全屏播放器
 *   盖住页面，返回时容易白屏。
 * - 右上角保留一个下载入口：微信里 <video> 没有「长按保存」，
 *   不给按钮用户就拿不走文件。
 */
export const MobileVideoPlayer: React.FC<MobileVideoPlayerProps> = ({ items, title }) => {
  if (items.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-neutral-400">这个二维码里还没有视频</div>;
  }

  return (
    <div className="flex w-full flex-col gap-px bg-black">
      {items.map((item, idx) => (
        <VideoTile key={item.id || idx} item={item} idx={idx} title={title} />
      ))}
    </div>
  );
};
