'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, HardDrive, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch, ApiError } from '@/lib/api-client';
import { CONTENT_TYPE_LABEL, type PricingConfig } from '@/types/admin';

interface Draft {
  price: string;
  enabled: boolean;
  includedSizeMb: string;
  stepSizeMb: string;
  stepPrice: string;
  validMonths: string;
  /** 按件累加：每个文件各收一次基础价 */
  perItem: boolean;
}

function toDraft(item: PricingConfig): Draft {
  return {
    price: String(item.price ?? 0),
    enabled: item.enabled === 1,
    includedSizeMb: String(item.includedSizeMb ?? 0),
    stepSizeMb: String(item.stepSizeMb ?? 0),
    stepPrice: String(item.stepPrice ?? 0),
    validMonths: String(item.validMonths ?? 0),
    perItem: item.perItem === 1,
  };
}

/** dynamic_qr.video -> 视频播放 */
function contentTypeOf(itemKey: string): string | null {
  const parts = itemKey.split('.');
  if (parts[0] !== 'dynamic_qr' || parts.length < 2) return null;
  return CONTENT_TYPE_LABEL[parts[1]] || parts[1];
}

export function PricingPanel() {
  const [items, setItems] = useState<PricingConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<PricingConfig[]>('/api/admin/pricing');
      const sorted = [...list].sort(
        (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.itemKey.localeCompare(b.itemKey)
      );
      setItems(sorted);
      setDrafts(Object.fromEntries(sorted.map((item) => [item.id, toDraft(item)])));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '价格配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 分成三组：分类明细（按二维码类型） / 通用兜底 / 其他计费项
  const { typeItems, fallbackItem, otherItems } = useMemo(() => {
    const typeItems: PricingConfig[] = [];
    const otherItems: PricingConfig[] = [];
    let fallbackItem: PricingConfig | null = null;

    for (const item of items) {
      if (item.itemKey === 'dynamic_qr') fallbackItem = item;
      else if (item.itemKey.startsWith('dynamic_qr.')) typeItems.push(item);
      else otherItems.push(item);
    }
    return { typeItems, fallbackItem, otherItems };
  }, [items]);

  const patch = (id: string, changes: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  };

  const save = async (item: PricingConfig) => {
    const draft = drafts[item.id];
    if (!draft) return;

    const price = Number(draft.price);
    if (Number.isNaN(price) || price < 0) {
      setError('价格必须是不小于 0 的数字');
      return;
    }

    setSavingId(item.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/pricing', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          price,
          enabled: draft.enabled ? 1 : 0,
          includedSizeMb: Number(draft.includedSizeMb) || 0,
          stepSizeMb: Number(draft.stepSizeMb) || 0,
          stepPrice: Number(draft.stepPrice) || 0,
          validMonths: Number(draft.validMonths) || 0,
          perItem: draft.perItem ? 1 : 0,
        }),
      });
      setNotice(`「${item.itemName}」已保存，立即生效`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const renderRow = (item: PricingConfig, showTier: boolean) => {
    const draft = drafts[item.id] ?? toDraft(item);
    const hasTier = showTier && Number(draft.includedSizeMb) > 0;

    return (
      <div
        key={item.id}
        className="flex flex-col gap-3 rounded-xl border border-slate-200/80 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            {contentTypeOf(item.itemKey) || item.itemName}
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {item.itemKey}
          </Badge>
          {draft.enabled ? (
            <Badge variant="success">收费中</Badge>
          ) : (
            <Badge variant="secondary">已关闭</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* 基础价 */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">基础价</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                ¥
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => patch(item.id, { price: e.target.value })}
                className="w-24 pl-6 text-sm"
              />
            </div>
          </label>

          {showTier && (
            <label className="flex items-center gap-1.5 pb-2 text-[11px] font-medium text-slate-600">
              <input
                type="checkbox"
                checked={draft.perItem}
                onChange={(e) => patch(item.id, { perItem: e.target.checked })}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              按件累加（每个文件各收一次）
            </label>
          )}

          {showTier && (
            <>
              {/* 含体积 */}
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <HardDrive className="h-3 w-3" aria-hidden="true" />
                  含体积
                </span>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={draft.includedSizeMb}
                    onChange={(e) => patch(item.id, { includedSizeMb: e.target.value })}
                    className="w-24 pr-8 text-sm"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                    MB
                  </span>
                </div>
              </label>

              {/* 步长 */}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">每超</span>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={draft.stepSizeMb}
                    onChange={(e) => patch(item.id, { stepSizeMb: e.target.value })}
                    disabled={!hasTier}
                    className="w-20 pr-8 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                    MB
                  </span>
                </div>
              </label>

              {/* 每档加价 */}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">加价</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    ¥
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.stepPrice}
                    onChange={(e) => patch(item.id, { stepPrice: e.target.value })}
                    disabled={!hasTier}
                    className="w-20 pl-6 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </label>
            </>
          )}

          {/* 有效期 */}
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              有效期
            </span>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step="1"
                value={draft.validMonths}
                onChange={(e) => patch(item.id, { validMonths: e.target.value })}
                className="w-20 pr-8 text-sm"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                月
              </span>
            </div>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => patch(item.id, { enabled: !draft.enabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                draft.enabled ? 'bg-blue-600' : 'bg-slate-300'
              }`}
              aria-label="切换收费开关"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  draft.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>

            <Button
              size="sm"
              onClick={() => save(item)}
              disabled={savingId === item.id}
              className="gap-1.5"
            >
              {savingId === item.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              保存
            </Button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          {draft.enabled
            ? hasTier
              ? `${draft.perItem ? '每件 ' : '每单 '}¥${Number(draft.price || 0).toFixed(2)}（含 ${draft.includedSizeMb}MB），超出后每 ${draft.stepSizeMb}MB 加收 ¥${Number(draft.stepPrice || 0).toFixed(2)}${draft.perItem ? '，按单件体积分别计算' : ''}`
              : `${draft.perItem ? '每件' : '每单'} ¥${Number(draft.price || 0).toFixed(2)}，不按体积加价`
            : '该项当前对所有用户免费'}
          {Number(draft.validMonths) > 0 && ` · 服务期 ${draft.validMonths} 个月`}
          {Number(draft.validMonths) === 0 && draft.enabled && ' · 永久有效'}
        </p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">价格与计费设置</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            按二维码类型分别定价；勾选「按件累加」后，每个文件各收一次基础价（图片按张、文件按个）
          </p>
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
      {notice && (
        <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          加载中...
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-5">
          <section className="flex flex-col gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                动态活码 · 按二维码类型定价
              </h4>
              <p className="mt-1 text-[11px] text-slate-400">
                按件累加：订单金额 = Σ（每件基础价 + 该件超体积加价）；不勾选则按全部文件总体积算一份
              </p>
            </div>
            {typeItems.map((item) => renderRow(item, true))}
          </section>

          {fallbackItem && (
            <section className="flex flex-col gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  兜底价
                </h4>
                <p className="mt-1 text-[11px] text-slate-400">
                  某个类型没有单独配置时使用，正常情况不会命中
                </p>
              </div>
              {renderRow(fallbackItem, false)}
            </section>
          )}

          {otherItems.length > 0 && (
            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                其他计费项
              </h4>
              {otherItems.map((item) => renderRow(item, false))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
