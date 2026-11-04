'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  Archive,
  CalendarPlus,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Infinity as InfinityIcon,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
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

type FilterKey = 'all' | 'todo' | 'expiring' | 'expired' | 'permanent' | 'deleted';
type BatchAction = 'show-brand' | 'hide-brand' | 'delete' | 'restore';

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '需跟进' },
  { value: 'expiring', label: '7 天内到期' },
  { value: 'expired', label: '已过期' },
  { value: 'permanent', label: '长期有效' },
  { value: 'deleted', label: '回收站' },
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

function matches(qr: AdminDynamicQr, keyword: string): boolean {
  if (!keyword) return true;
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  return [qr.title, qr.shortCode, qr.ownerEmail]
    .some((v) => (v || '').toLowerCase().includes(k));
}

export function QrManagePanel() {
  const [data, setData] = useState<ExpiringQrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  /** 正在请求中的行 id（或 'batch'），用来置灰单个按钮而不是整页转圈 */
  const [busy, setBusy] = useState<string | null>(null);

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
    const alive = items.filter((i) => !i.deleted);
    let list: AdminDynamicQr[];
    switch (filter) {
      case 'todo':
        list = alive.filter((i) => i.status === 'expired' || i.status === 'expiring')
          .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
        break;
      case 'expiring':
        list = alive.filter((i) => i.status === 'expiring');
        break;
      case 'expired':
        list = alive.filter((i) => i.status === 'expired');
        break;
      case 'permanent':
        list = alive.filter((i) => i.status === 'permanent');
        break;
      case 'deleted':
        list = items.filter((i) => i.deleted);
        break;
      default:
        list = alive;
    }
    return list.filter((i) => matches(i, keyword));
  }, [items, filter, keyword]);

  // 筛选变化后，已选中但已不可见的行要从选区里剔除，
  // 否则「批量删除 3 条」实际可能删到一条你看不见的活码
  useEffect(() => {
    const visibleIds = new Set(visible.map((i) => i.id));
    setSelected((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [visible]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2600);
  };

  const post = async (url: string, body?: unknown) => {
    await apiFetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  const runRow = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '操作失败');
    } finally {
      setBusy(null);
    }
  };

  const toggleBrand = (qr: AdminDynamicQr) =>
    runRow(qr.id, async () => {
      const next = qr.showBrandHeader === 1 ? 0 : 1;
      await post(`/api/admin/dynamic-qrs/${qr.id}`, { showBrandHeader: next });
      flash(next === 0 ? '已隐藏品牌栏，下次扫码即生效' : '已恢复品牌栏');
    });

  const renew = (qr: AdminDynamicQr) =>
    runRow(qr.id, async () => {
      await post(`/api/admin/dynamic-qrs/${qr.id}/renew`, { months: 3 });
      flash('已续期 3 个月');
    });

  const removeOne = (qr: AdminDynamicQr) =>
    runRow(qr.id, async () => {
      await post(`/api/admin/dynamic-qrs/${qr.id}/delete`);
      flash('已移入回收站');
    });

  const restoreOne = (qr: AdminDynamicQr) =>
    runRow(qr.id, async () => {
      await post(`/api/admin/dynamic-qrs/${qr.id}/restore`);
      flash('已恢复到活码列表');
    });

  const batch = async (action: BatchAction) => {
    if (selected.length === 0) return;
    setBusy('batch');
    setError(null);
    try {
      await post('/api/admin/dynamic-qrs/batch', { ids: selected, action });
      const labels: Record<BatchAction, string> = {
        'show-brand': '已恢复品牌栏',
        'hide-brand': '已隐藏品牌栏',
        delete: '已移入回收站',
        restore: '已恢复',
      };
      flash(`${labels[action]}（${selected.length} 条）`);
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '批量操作失败');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label}已复制到剪贴板`);
    } catch {
      setError('浏览器拒绝了剪贴板访问，请手动选择文本复制');
    }
  };

  const allChecked = visible.length > 0 && selected.length === visible.length;
  const inTrash = filter === 'deleted';

  return (
    <div className="flex flex-col gap-4">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={QrCode}
          tone="blue"
          label="在用活码"
          value={stats?.total ?? 0}
          hint="不含回收站"
        />
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
          icon={Archive}
          tone="slate"
          label="回收站"
          value={stats?.deleted ?? 0}
          hint="可随时恢复"
        />
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="关闭错误提示" className="shrink-0">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* 筛选 + 搜索 */}
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
                {f.value === 'deleted' && stats?.deleted ? ` (${stats.deleted})` : ''}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜标题 / 短码 / 邮箱"
                aria-label="搜索活码"
                className="h-9 w-48 rounded-lg border border-slate-200 pl-8 pr-2 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 gap-1.5">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              刷新
            </Button>
          </div>
        </div>

        {/* 批量操作条：有选中才出现，避免常驻一排用不到的按钮 */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/60 px-4 py-2.5">
            <span className="text-xs font-medium text-blue-800">已选 {selected.length} 条</span>
            {inTrash ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={busy === 'batch'}
                onClick={() => batch('restore')}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                恢复
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={busy === 'batch'}
                  onClick={() => batch('hide-brand')}
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  隐藏品牌栏
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={busy === 'batch'}
                  onClick={() => batch('show-brand')}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  显示品牌栏
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-rose-600 hover:text-rose-700"
                  disabled={busy === 'batch'}
                  onClick={() => batch('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  移入回收站
                </Button>
              </>
            )}
            <button
              onClick={() => setSelected([])}
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              取消选择
            </button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在加载活码...
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              {filter === 'todo' ? '没有需要跟进的活码' : keyword ? '没有匹配的活码' : '该分类下没有活码'}
            </p>
            <p className="text-xs text-slate-400">动态活码默认 3 个月服务期，到期前 7 天会进入「需跟进」</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => setSelected(e.target.checked ? visible.map((i) => i.id) : [])}
                aria-label="全选当前列表"
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <span className="text-[11px] text-slate-500">全选（当前 {visible.length} 条）</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {visible.map((qr) => {
                const rowBusy = busy === qr.id;
                return (
                  <li key={qr.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(qr.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked ? [...prev, qr.id] : prev.filter((id) => id !== qr.id),
                        )
                      }
                      aria-label={`选择 ${qr.title || qr.shortCode}`}
                      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {qr.title || '（无标题）'}
                        </span>
                        <Badge variant={badgeVariant(qr.status)} className="shrink-0">
                          {QR_LIFECYCLE_LABEL[qr.status]}
                        </Badge>
                        {qr.showBrandHeader === 0 && !qr.deleted && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            品牌栏已隐藏
                          </span>
                        )}
                        {qr.deleted && (
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                            回收站
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span className="font-mono text-slate-500">/q/{qr.shortCode}</span>
                        <span>{CONTENT_TYPE_LABEL[qr.contentType] || qr.contentType}</span>
                        <span>到期 {fmtDate(qr.expiresAt)}</span>
                        <span className="font-medium text-slate-500">{daysLeftText(qr)}</span>
                        <span>扫码 {qr.scanCount ?? 0} 次</span>
                        {qr.ownerEmail && <span>{qr.ownerEmail}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={rowBusy}
                        onClick={() => toggleBrand(qr)}
                      >
                        {qr.showBrandHeader === 1 ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                            隐藏品牌栏
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            显示品牌栏
                          </>
                        )}
                      </Button>

                      {!qr.deleted && qr.status !== 'permanent' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={rowBusy}
                          onClick={() => renew(qr)}
                        >
                          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          续期 3 个月
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => copy(remindText(qr), '提醒文案')}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        复制提醒
                      </Button>

                      <a
                        href={`/q/${qr.shortCode}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开 /q/${qr.shortCode}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>

                      {qr.deleted ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={rowBusy}
                          onClick={() => restoreOne(qr)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          恢复
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-rose-600 hover:text-rose-700"
                          disabled={rowBusy}
                          onClick={() => removeOne(qr)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          删除
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        说明：删除是「移入回收站」，扫码立即返回 404，但随时可以恢复。
        上传的文件不会被删除 —— 上传走内容哈希去重，同一个文件可能被多个活码共用，
        因此只解除引用、不清理物理文件。
      </p>
    </div>
  );
}

const TONES = {
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-600',
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
