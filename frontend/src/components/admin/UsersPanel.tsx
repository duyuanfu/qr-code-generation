'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { AdminUser } from '@/types/admin';

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await apiFetch<AdminUser[]>('/api/admin/users'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (user: AdminUser) => {
    setBusyId(user.id);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}/toggle-status`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = async (user: AdminUser) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`确定将 ${user.email} 的角色改为「${nextRole === 'admin' ? '管理员' : '普通用户'}」吗？`)) {
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">用户管理</h3>
          <p className="mt-0.5 text-xs text-slate-500">共 {users.length} 个账号，管理员角色可免费使用全部功能</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          刷新
        </Button>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            加载中...
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">暂无用户</div>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-medium">邮箱</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">注册时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-800">{user.email}</td>
                  <td className="px-3 py-3">
                    {user.role === 'admin' ? (
                      <Badge variant="default" className="gap-1">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        管理员
                      </Badge>
                    ) : (
                      <Badge variant="secondary">普通用户</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {user.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        正常
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                        已禁用
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleRole(user)}
                        disabled={busyId === user.id}
                      >
                        {user.role === 'admin' ? (
                          <>
                            <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            降为普通
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            设为管理员
                          </>
                        )}
                      </Button>
                      <Button
                        variant={user.status === 'active' ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => toggleStatus(user)}
                        disabled={busyId === user.id || user.role === 'admin'}
                        title={user.role === 'admin' ? '不能禁用超级管理员' : undefined}
                      >
                        {user.status === 'active' ? '禁用' : '启用'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
