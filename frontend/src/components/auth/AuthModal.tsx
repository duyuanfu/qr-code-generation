'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.message || '操作失败，请重试');
        return;
      }

      if (data.data?.user) {
        login(data.data.user, data.data.token);
      }
    } catch (err: any) {
      setError(err.message || '网络连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white p-5 pb-safe shadow-2xl sm:p-6">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          aria-label="关闭登录窗口"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-3">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {isRegister ? '创建 QR Studio 账号' : '欢迎登录 QR Studio'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isRegister ? '注册即可享受专属二维码制作、活码管理特权' : '登录以管理您的二维码与订单'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-slate-700">电子邮箱</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-slate-700">登录密码</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <Input
                type="password"
                required
                placeholder="至少 6 位密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 font-medium py-2.5"
          >
            {loading ? (
              '处理中...'
            ) : isRegister ? (
              <span className="flex items-center justify-center gap-2">
                <UserPlus className="h-4 w-4" aria-hidden="true" /> 立即注册
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <LogIn className="h-4 w-4" aria-hidden="true" /> 安全登录
              </span>
            )}
          </Button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 text-center text-xs text-slate-500">
          {isRegister ? (
            <span>
              已有账号？{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
                className="-my-2 inline-block rounded py-2 font-semibold text-blue-600 hover:underline"
              >
                直接登录
              </button>
            </span>
          ) : (
            <span>
              还没有账号？{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
                className="-my-2 inline-block rounded py-2 font-semibold text-blue-600 hover:underline"
              >
                免费注册新账号
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
