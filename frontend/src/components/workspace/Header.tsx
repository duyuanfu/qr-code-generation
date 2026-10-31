'use client';

import React from 'react';
import Link from 'next/link';
import { QrCode, Layers, ScanLine, Sparkles, ShieldAlert, LogOut, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/AuthContext';
import { FEATURES } from '@/lib/features';

interface HeaderProps {
  currentTab: 'single' | 'batch-generate' | 'batch-decode';
  onTabChange: (tab: 'single' | 'batch-generate' | 'batch-decode') => void;
}

const TABS: { id: 'single' | 'batch-generate' | 'batch-decode'; label: string; short: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'single', label: '单个生成与美化', short: '单个生成', icon: Sparkles },
  { id: 'batch-generate', label: '批量生成', short: '批量生成', icon: Layers },
  { id: 'batch-decode', label: '批量解码识别', short: '批量解码', icon: ScanLine },
];

/**
 * 顶部导航。
 *
 * 布局策略：手机竖屏（<md）分两行 —— 第一行品牌 + 账号，第二行可横向滚动的 tab。
 * 之前三块内容挤在同一行，品牌区加三段 tab 加用户区接近 740px，
 * 在 375px 屏上直接把整个 body 撑出横向滚动条。
 *
 * 触控目标：tab 与图标按钮统一 44px 高，图标一律 aria-hidden（旁边都有文字）。
 */
export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange }) => {
  const { user, openAuthModal, logout } = useAuth();
  /** 未开放的 tab 挂个「内测」小标，让用户点之前就知道，而不是点了没反应 */
  const batchGenerateSoon = !FEATURES.batchGenerate;

  const renderTab = (tab: (typeof TABS)[number], compact = false) => {
    const Icon = tab.icon;
    const active = currentTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        aria-current={active ? 'page' : undefined}
        className={[
          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-all md:min-h-0 md:py-1.5',
          compact ? 'min-h-[40px]' : 'min-h-[44px]',
          active ? 'bg-white font-semibold text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="md:hidden">{tab.short}</span>
        <span className="hidden md:inline">{tab.label}</span>
        {tab.id === 'batch-generate' && batchGenerateSoon && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700">
            内测
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 pt-[var(--safe-top)] backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 sm:px-4 md:h-16 md:px-6">
        {/* Brand：小屏只留 logo + 站名，副标题让位给 tab */}
        <Link href="/" className="flex min-w-0 items-center gap-2.5 md:gap-3" aria-label="QR Studio 首页">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 md:h-10 md:w-10">
            <QrCode className="h-5 w-5 md:h-6 md:w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold tracking-tight text-slate-900 md:text-lg">QR Studio</span>
              <Badge variant="success" className="h-4 shrink-0 px-1.5 py-0 text-[10px]">
                PRO
              </Badge>
            </div>
            <p className="hidden text-[11px] font-medium text-slate-500 md:block">全能二维码生成与美化工作台</p>
          </div>
        </Link>

        {/* 桌面端的模式切换；手机端挪到下面一行横滑 */}
        <div className="hidden items-center rounded-xl bg-slate-100 p-1 md:flex">
          {TABS.map((t) => renderTab(t))}
        </div>

        {/* 右侧账号区 */}
        <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link href="/admin" aria-label="管理后台">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 border-purple-200 bg-purple-50 px-2.5 font-medium text-purple-700 hover:bg-purple-100"
                  >
                    <ShieldAlert className="h-4 w-4 text-purple-600" aria-hidden="true" />
                    <span className="hidden sm:inline">管理后台</span>
                  </Button>
                </Link>
              )}

              <div className="hidden items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-100 px-3 py-1.5 text-xs lg:flex">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="max-w-[120px] truncate font-semibold text-slate-800">{user.email}</span>
                  <span className="text-[10px] font-medium text-blue-600">
                    {user.role === 'admin' ? '超级管理员 (免费特权)' : '普通会员'}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                title="退出登录"
                aria-label="退出登录"
                className="h-10 w-10 p-0 text-slate-500 hover:text-slate-800"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={openAuthModal}
              className="h-10 gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 font-medium shadow-sm hover:from-blue-700 hover:to-indigo-700"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">登录 / 注册</span>
              <span className="sm:hidden">登录</span>
            </Button>
          )}
        </div>
      </div>

      {/* 手机端：横向滚动的 tab 行，不换行、不挤压 */}
      <div className="flex gap-1 overflow-x-auto bg-slate-100/80 px-2 pb-2 pt-0.5 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => renderTab(t, true))}
      </div>
    </header>
  );
};
