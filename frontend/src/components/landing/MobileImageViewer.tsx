'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface MediaItem {
  id?: string;
  name?: string;
  url: string;
  size?: number;
  type?: string;
}

interface MobileImageViewerProps {
  items: MediaItem[];
  title?: string;
}

/**
 * 单张图片：带加载骨架 + 失败降级。
 *
 * 骨架不只是好看 —— 图片没占位时，<img> 在加载完成前高度为 0，
 * 加载完瞬间撑开会把下面所有内容顶下去（CLS），多图连排时尤其明显。
 * 给一个 4:3 的占位块，至少总高度不会从 0 开始跳。
 *
 * 失败降级是必须的：上传文件可能被清理、外链可能失效，
 * 没有 onError 的话用户看到的是一张破图图标，看起来像网站坏了。
 */
const ImageTile: React.FC<{ item: MediaItem; idx: number; title?: string; onOpen: () => void }> = ({
  item,
  idx,
  title,
  onOpen,
}) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  if (state === 'error') {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 bg-slate-50 px-6 py-16 text-slate-400"
        style={{ aspectRatio: '4 / 3' }}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m3 16 5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="9" r="1.4" />
        </svg>
        <span className="text-xs">这张图片暂时无法加载</span>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-slate-100" style={state === 'loading' ? { aspectRatio: '4 / 3' } : undefined}>
      {state === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-slate-100" aria-hidden="true" />
      )}
      <img
        src={item.url}
        alt={item.name || title || `图片 ${idx + 1}`}
        loading={idx === 0 ? 'eager' : 'lazy'}
        decoding="async"
        onClick={onOpen}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={[
          'block w-full cursor-zoom-in select-none bg-white transition-opacity duration-300',
          state === 'ready' ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />
    </div>
  );
};

/**
 * 图片落地页：与 PDF 查看器保持同一种「零骨架」体验。
 *
 * 设计取舍：
 * - 不画卡片、不画边框、不写「图片画廊 (N) / 点击可放大」这类说明文字
 *   —— 扫码的人是来看图的，不是来读 UI 文案的。
 * - 图片按原始比例铺满屏幕宽度，多图直接纵向连排，滚动即浏览。
 * - 点按进入全屏，左右滑动切图（触摸）/ 键盘方向键切图（桌面），点击空白或按 Esc 退出。
 * - 保存原图交给系统长按菜单（iOS/Android/微信都原生支持），右下角另留一个下载按钮
 *   —— 微信里长按图片有时只给「发送给朋友」，不给「保存」。
 */
export const MobileImageViewer: React.FC<MobileImageViewerProps> = ({ items, title }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const absoluteUrl = useCallback((url: string) => {
    if (typeof window === 'undefined') return url;
    return url.startsWith('http') ? url : `${window.location.origin}${url}`;
  }, []);

  const close = useCallback(() => setActiveIdx(null), []);
  const prev = useCallback(
    () => setActiveIdx((i) => (i === null ? i : (i - 1 + items.length) % items.length)),
    [items.length]
  );
  const next = useCallback(
    () => setActiveIdx((i) => (i === null ? i : (i + 1) % items.length)),
    [items.length]
  );

  // 键盘导航（桌面端预览时也能用得顺手）
  useEffect(() => {
    if (activeIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    // 锁住背景滚动，避免全屏时还能拖动底层页面
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeIdx, close, prev, next]);

  const open = (idx: number) => {
    // 微信内置浏览器有原生图片预览，体验比自绘 lightbox 好，优先走它
    const bridge = typeof window !== 'undefined' ? (window as any).WeixinJSBridge : undefined;
    if (bridge?.invoke) {
      bridge.invoke('imagePreview', {
        current: absoluteUrl(items[idx].url),
        urls: items.map((m) => absoluteUrl(m.url)),
      });
      return;
    }
    setActiveIdx(idx);
  };

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-400">这个二维码里还没有图片</div>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col bg-white">
        {items.map((item, idx) => (
          <div key={item.id || idx} className="group relative w-full">
            <ImageTile item={item} idx={idx} title={title} onOpen={() => open(idx)} />
            {/* 每张图右下角一个低干扰的保存按钮：手机上常显，桌面端悬停才出现 */}
            <a
              href={item.url}
              download={item.name || `image-${idx + 1}.png`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`保存${item.name || `第 ${idx + 1} 张图片`}`}
              className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/95 backdrop-blur transition-opacity active:bg-black/60 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        ))}
      </div>

      {activeIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={close}
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50 && items.length > 1) {
              dx > 0 ? prev() : next();
            }
            setTouchStartX(null);
          }}
        >
          <img
            src={items[activeIdx].url}
            alt={items[activeIdx].name || `图片 ${activeIdx + 1}`}
            className="max-h-app max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* 关闭：右上角，足够大但不抢视觉 */}
          <button
            type="button"
            aria-label="关闭"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur active:bg-black/60"
            style={{ top: 'calc(var(--safe-top) + 0.5rem)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* 底部操作条：保存原图 + 页码（单图时只显示保存），给 Home 指示条留位置 */}
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-safe pt-10"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={items[activeIdx].url}
              download={items[activeIdx].name || `image-${activeIdx + 1}.png`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/95 px-4 text-xs font-semibold text-slate-900 shadow-lg active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              保存这张
            </a>
            {items.length > 1 && (
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs tabular-nums text-white/90 backdrop-blur">
                {activeIdx + 1} / {items.length}
              </span>
            )}
          </div>

          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur active:bg-black/60"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur active:bg-black/60"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};
