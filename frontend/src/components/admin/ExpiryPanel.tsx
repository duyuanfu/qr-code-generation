'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  Infinity as InfinityIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  CONTENT_TYPE_LABEL,
  QR_LIFECYCLE_LABEL,
  daysLeftText,
  type AdminDynamicQr,
  type ExpiringQrResponse,
  type QrLifecycleStatus,
} from '@/types/admin';

type FilterKey = 'todo' | 'expired' | 'within7' | 'all';

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'todo', label: '需跟进' },
  { value: 'expired', label: '已过期' },
  { value: 'within7', label: '7 天内到期' },
  { value: 'all', label: '全部' },
];

function badgeVariant(status: QrLifecycleStatus): 'success' | 'warning' | 'danger' | 'secondary' {
  if (status === 'expired') return 'danger';
  if (status === 'expiring') return 'warning';
  if (status === 'active') return 'success';
  return 'secondary';
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-CN');
}

/** 一键复制给客户发的话术，省掉运营每天手打一遍 */
function remindText(qr: AdminDynamicQr): string {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/q/${qr.shortCode}`;
  const tail =
    qr.status === 'expired'
      ? `已于 ${fmtDate(qr.expiresAt)} 到期，扫码会看到续费提示。`
      : `将于 ${fmtDate(qr.expiresAt)} 到期（${daysLeftText(qr)}）。`;
  return `您好，您的「${qr.title || qr.shortCode}」二维码服务${tail}续费后无需重新印刷，原有二维码继续可用。链接：${link}`;
}

export function ExpiryPanel() {
  const [data, setData] = useState<ExpiringQrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('todo');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<ExpiringQrResponse>('/api/admin/dynamic-qrs'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '活码列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items ?? [];
  const stats = data?.stats;

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'expired') return items.filter((i) => i.status === 'expired');
    if (filter === 'within7') return items.filter((i) => i.status === 'expiring');
    // 需跟进 = 已过期 + 7 天内到期，按紧急程度排（过期越久越靠前）
    return items
      .filter((i) => i.status === 'expired' || i.status === 'expiring')
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }, [items, filter]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label}已复制到剪贴板`);
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError('浏览器拒绝了剪贴板访问，请手动选择文本复制');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={AlertTriangle}
          tone="rose"
          label="已过期"
          value={stats?.expired ?? 0}
          hint="客户扫码会看到续费提示"
        />
        <StatCard
          icon={AlarmClock}
          tone="amber"
          label="7 天内到期"
          value={stats?.within7 ?? 0}
          hint="建议提前联系续费"
        />
        <StatCard
          icon={CalendarClock}
          tone="blue"
          label="30 天内到期"
          value={stats?.within30 ?? 0}
          hint="含上面 7 天内那一档"
        />
        <StatCard
          icon={InfinityIcon}
          tone="emerald"
          label="长期有效"
          value={stats?.permanent ?? 0}
          hint="没有设置服务期"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
                {f.value === 'all' ? ` (${stats?.total ?? 0})` : ''}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            刷新
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在统计服务期...
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              {filter === 'todo' ? '没有需要跟进的活码' : '该分类下没有活码'}
            </p>
            <p className="text-xs text-slate-400">动态活码默认 3 个月服务期，到期前 7 天会出现在这里</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((qr) => (
              <li key={qr.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {qr.title || '（无标题）'}
                    </span>
                    <Badge variant={badgeVariant(qr.status)} className="shrink-0">
                      {QR_LIFECYCLE_LABEL[qr.status]}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span className="font-mono text-slate-500">/q/{qr.shortCode}</span>
                    <span>{CONTENT_TYPE_LABEL[qr.contentType] || qr.contentType}</span>
                    <span>到期 {fmtDate(qr.expiresAt)}</span>
                    <span className="font-medium text-slate-500">{daysLeftText(qr)}</span>
                    {qr.ownerEmail && <span>{qr.ownerEmail}</span>}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copy(remindText(qr), '提醒文案')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  复制提醒
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        提示：服务期由下单时命中的定价项 <code className="rounded bg-slate-100 px-1">validMonths</code> 决定，
        落地页到期后只会显示续费提示、不会直接断掉内容，所以建议到期前主动联系客户。
      </p>
    </div>
  );
}

const TONES = {
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
} as const;

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  tone: keyof typeof TONES;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
