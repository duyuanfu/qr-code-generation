'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  LogOut,
  QrCode,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/AuthContext';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { PricingPanel } from '@/components/admin/PricingPanel';
import { PaymentConfigPanel } from '@/components/admin/PaymentConfigPanel';
import { OrdersPanel } from '@/components/admin/OrdersPanel';
import { ExpiryPanel } from '@/components/admin/ExpiryPanel';

const TAB_ITEMS = [
  { value: 'users', label: '用户管理', icon: Users },
  { value: 'pricing', label: '价格配置', icon: Tags },
  { value: 'payment', label: '收款码', icon: Wallet },
  { value: 'orders', label: '订单审核', icon: ReceiptText },
  { value: 'expiry', label: '过期提醒', icon: CalendarClock },
];

export default function AdminConsolePage() {
  const { user, loading, logout, openAuthModal } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('users');

  const isAdmin = !!user && user.role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      router.replace('/');
      if (!user) openAuthModal();
    }
    // 仅在登录态变化时判定，避免 openAuthModal 引用变化导致重复跳转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAdmin, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        正在校验管理权限...
      </div>
    );
  }

  if (!isAdmin || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">需要管理员权限</h1>
          <p className="mt-1 text-xs text-slate-500">
            {user ? '当前账号不是管理员，无法访问管理后台。' : '请先使用管理员账号登录。'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!user && (
            <Button onClick={openAuthModal} className="gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              立即登录
            </Button>
          )}
          <Link href="/">
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回工作台
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 flex min-h-14 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 pt-[var(--safe-top)] backdrop-blur sm:px-4 md:min-h-16 md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 md:h-10 md:w-10">
              <QrCode className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 md:text-lg">QR Studio</span>
                <Badge variant="default" className="h-4 px-1.5 py-0 text-[10px]">
                  管理后台
                </Badge>
              </div>
              <p className="hidden text-[11px] font-medium text-slate-500 sm:block">用户 · 计费 · 收款 · 订单审核 · 服务期提醒</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-700">{user.email}</span>
            <span className="text-[10px] text-slate-400">超级管理员</span>
          </div>

          <Link href="/">
            <Button variant="outline" size="sm" className="h-10 gap-1.5 px-2.5 sm:px-3">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">工作台</span>
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              router.replace('/');
            }}
            aria-label="退出登录"
            className="h-10 gap-1.5 px-2.5 sm:px-3"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 md:px-6 md:py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            {TAB_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger key={item.value} value={item.value} className="gap-1.5 px-2.5 py-2 text-[13px] sm:px-4 sm:text-sm">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="users">
            <UsersPanel />
          </TabsContent>
          <TabsContent value="pricing">
            <PricingPanel />
          </TabsContent>
          <TabsContent value="payment">
            <PaymentConfigPanel />
          </TabsContent>
          <TabsContent value="orders">
            <OrdersPanel />
          </TabsContent>
          <TabsContent value="expiry">
            <ExpiryPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
