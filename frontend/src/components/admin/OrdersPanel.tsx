'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  actionTypeLabel,
  ORDER_STATUS_LABEL,
  type AdminOrder,
  type OrderStatus,
} from '@/types/admin';

const FILTERS: { value: 'all' | OrderStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待支付' },
  { value: 'pending_review', label: '待审核' },
  { value: 'paid', label: '已支付' },
  { value: 'used', label: '已核销' },
];

function statusBadgeVariant(status: OrderStatus): 'success' | 'warning' | 'secondary' | 'outline' {
  if (status === 'paid') return 'success';
  if (status === 'pending_review') return 'warning';
  if (status === 'pending') return 'outline';
  return 'secondary';
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await apiFetch<AdminOrder[]>('/api/admin/orders'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '订单列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (order: AdminOrder) => {
    if (!confirm(`确认已收到订单 ${order.orderNo} 的 ¥${Number(order.amount).toFixed(2)} 款项？`)) {
      return;
    }
    setBusyId(order.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/orders/${order.id}/approve`, { method: 'POST' });
      setNotice(`订单 ${order.orderNo} 已审核通过，用户端将自动放行`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '审核失败');
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">订单流水与审核</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            用户提交「我已完成支付」后状态变为待审核，审核通过后客户端轮询会自动放行
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  filter === item.value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </div>
      )}

      <div className="overflow-x-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            加载中...
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">暂无订单</div>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-medium">订单号</th>
                <th className="px-3 py-2 font-medium">用户</th>
                <th className="px-3 py-2 font-medium">业务类型</th>
                <th className="px-3 py-2 font-medium">金额</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-mono text-xs text-slate-700">{order.orderNo}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{order.userEmail || order.userId}</td>
                  <td className="px-3 py-3 text-xs text-slate-700">
                    {actionTypeLabel(order.actionType)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-800">
                    ¥{Number(order.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={statusBadgeVariant(order.status)}>
                      {ORDER_STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    {order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {order.status === 'paid' || order.status === 'used' ? (
                      <span className="text-xs text-slate-400">
                        {order.paidAt ? new Date(order.paidAt).toLocaleString('zh-CN') : '已放行'}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => approve(order)}
                        disabled={busyId === order.id}
                        className="gap-1.5"
                      >
                        {busyId === order.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        确认到账
                      </Button>
                    )}
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
