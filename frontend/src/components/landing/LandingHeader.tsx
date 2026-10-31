import React from 'react';
import { QrCode, ArrowUpRight } from 'lucide-react';
import { BRAND } from '@/lib/brand';

interface LandingHeaderProps {
  /** light：白底页面用；dark：视频等黑底页面用 */
  variant?: 'light' | 'dark';
  /** 是否给页面内容留出顶部高度（滚动型页面为 true，全屏阅读器也用 true 以免被遮住） */
  sticky?: boolean;
}

/**
 * 扫码落地页的顶部品牌栏。
 *
 * 左边是站点 logo + 名称（整体可点，回品牌首页），右边是「进入首页」入口。
 * 定位是 fixed，所以调用方必须用 `pt-landing-header` 给内容留出
 * 「安全区 + 3rem」的顶部内边距 —— 写死 `pt-12` 在刘海屏上会被状态栏压住半截。
 *
 * logo 刻意与工作台左上角那一枚保持同款：同样的蓝→靛渐变、同样的圆角比例、
 * 同样是 `QrCode` 图标（所以二维码的「格数」与现有 logo 图片完全一致，只是尺寸放大），
 * 这样客户从扫码页跳回首页时不会觉得换了个产品。
 *
 * 两个链接都撑到 44px 高：顶栏本身只有 48px，留给手指的余量本来就少，
 * 再把点击区做成 28px 高的胶囊，单手扫码后基本点不中。
 */
export function LandingHeader({ variant = 'light', sticky = true }: LandingHeaderProps) {
  const dark = variant === 'dark';

  return (
    <header
      className={[
        sticky ? 'fixed inset-x-0 top-0 z-40' : 'relative',
        'border-b',
        dark
          ? 'border-white/10 bg-black/55 text-white backdrop-blur'
          : 'border-slate-200/70 bg-white/85 text-slate-800 backdrop-blur',
      ].join(' ')}
    >
      {/* 总高 = 3rem + 状态栏；用内边距吃掉安全区，内容区仍是完整的 3rem */}
      <div className="flex h-[var(--landing-header-h)] items-center justify-between gap-2 px-3 pt-[var(--safe-top)] sm:px-4">
        <a
          href={BRAND.url}
          className="group flex min-h-[44px] min-w-0 items-center gap-2"
          aria-label={`${BRAND.name} 首页`}
          title={`返回 ${BRAND.name} 首页`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 transition-transform group-hover:scale-105">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </span>
          <span
            className={[
              'truncate text-sm font-semibold tracking-tight transition-colors',
              dark ? 'text-white group-hover:text-white/80' : 'text-slate-900 group-hover:text-blue-700',
            ].join(' ')}
          >
            {BRAND.name}
          </span>
        </a>

        <a
          href={BRAND.url}
          className={[
            'inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors',
            dark
              ? 'text-white/85 hover:bg-white/15'
              : 'text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          进入首页
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
