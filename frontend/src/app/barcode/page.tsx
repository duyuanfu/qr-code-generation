'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, LogIn, LogOut, ScanBarcode, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarcodeWorkbench } from '@/components/barcode/BarcodeWorkbench';
import { useAuth } from '@/components/auth/AuthContext';

/**
 * 商品条形码标签导出。
 *
 * <p>独立成页而不是塞进工作台：条形码的参数集（码制 / 毫米 / DPI）与二维码的
 * 美化参数几乎没有交集，混在一个表单里会出现一堆「选了没反应」的控件。
 */
export default function BarcodePage() {
  const { user, openAuthModal, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4 md:h-16">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              aria-label="返回工作台"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                <span className="truncate text-base font-bold tracking-tight text-slate-900">
                  商品条形码标签
                </span>
              </div>
              <p className="hidden text-[11px] font-medium text-slate-500 sm:block">
                EAN-13 / Code 128，按毫米输出可打印的标签
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {user ? (
              <>
                {user.role === 'admin' && (
                  <Link href="/admin" aria-label="管理后台">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 border-purple-200 bg-purple-50 px-2.5 text-purple-700 hover:bg-purple-100"
                    >
                      <ShieldAlert className="h-4 w-4 text-purple-600" aria-hidden="true" />
                      <span className="hidden sm:inline">管理后台</span>
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  title="退出登录"
                  aria-label="退出登录"
                  className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={openAuthModal}
                className="h-9 gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 font-medium"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      <BarcodeWorkbench />
    </div>
  );
}
