'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentModal } from '@/components/workspace/PaymentModal';
import { BarcodeForm } from '@/components/barcode/BarcodeForm';
import { BarcodePreview } from '@/components/barcode/BarcodePreview';
import { useAuth } from '@/components/auth/AuthContext';
import { authHeaders } from '@/lib/api-client';
import { validateBarcode } from '@/lib/barcode-format';
import {
  DEFAULT_BARCODE_PARAMS,
  type BarcodeExportResult,
  type BarcodeParams,
  type BarcodePreviewResult,
} from '@/types/barcode';

interface ApiEnvelope<T> {
  ok: boolean;
  code: number;
  message: string;
  data: T | null;
}

async function postBarcode<T>(path: string, body: unknown): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!json) {
    return { ok: false, code: res.status, message: `服务响应异常 (HTTP ${res.status})`, data: null };
  }
  return {
    ok: json.success === true,
    code: json.code ?? res.status,
    message: json.message ?? '',
    data: json.data ?? null,
  };
}

export const BarcodeWorkbench: React.FC = () => {
  const { user, openAuthModal } = useAuth();

  const [params, setParams] = useState<BarcodeParams>(DEFAULT_BARCODE_PARAMS);
  const [preview, setPreview] = useState<BarcodePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeExportResult | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const patch = useCallback((p: Partial<BarcodeParams>) => {
    setParams((prev) => ({ ...prev, ...p }));
    // 参数一变，上一版结果就作废（否则用户会以为下载到的是新参数的文件）
    setResult(null);
    setExportError(null);
  }, []);

  /** 本地能判的问题先判掉，避免每次敲键都发一次必然失败的请求 */
  const localError = useMemo(() => {
    const contentError = validateBarcode(params);
    if (contentError) return contentError;
    if (!Number.isFinite(params.labelWidthMm) || !Number.isFinite(params.labelHeightMm)) {
      return '请填写标签宽度与高度';
    }
    return null;
  }, [params]);

  const seqRef = useRef(0);

  /**
   * 预览自动刷新。
   *
   * <p>400ms 防抖 + 请求序号：连续改参数时只保留最后一次的响应，
   * 否则先发的慢请求后到，会把预览刷回旧内容。
   */
  useEffect(() => {
    if (localError) {
      setPreview(null);
      setPreviewError(localError);
      return;
    }
    const id = ++seqRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await postBarcode<BarcodePreviewResult>('/api/barcode/preview', params);
        if (id !== seqRef.current) return;
        if (res.ok && res.data) {
          setPreview(res.data);
          setPreviewError(null);
        } else {
          setPreview(null);
          setPreviewError(res.message || '预览生成失败');
        }
      } catch (e) {
        if (id === seqRef.current) {
          setPreview(null);
          setPreviewError(e instanceof Error ? e.message : '网络异常');
        }
      } finally {
        if (id === seqRef.current) setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [params, localError]);

  const readable = Boolean(preview?.readable) && !localError;
  const canExport = Boolean(user) && readable && !exporting;

  const doExport = async (orderId?: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (!readable) return;

    setExporting(true);
    setExportError(null);
    try {
      const res = await postBarcode<BarcodeExportResult>('/api/barcode/export', { ...params, orderId });
      if (res.ok && res.data) {
        setResult(res.data);
        return;
      }
      if (res.code === 401) {
        openAuthModal();
        return;
      }
      if (res.code === 402) {
        setPayOpen(true);
        return;
      }
      setExportError(res.message || '导出失败');
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:py-8">
      {/* 左：预览 + 打印须知 */}
      <div className="flex min-w-0 flex-col gap-4">
        <BarcodePreview preview={preview} loading={loading} error={localError ?? previewError} />

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">打印前请确认三件事</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-500">
                <li>· 打印时选 <span className="font-semibold text-slate-700">100% 原大</span>，不要勾「适应页面」，否则条宽比例会失真。</li>
                <li>· 条形码不支持换色与叠图 —— 浅条深底、加 Logo 都会让激光枪读不出，所以本页不提供这些选项。</li>
                <li>· 贴在不干胶或白纸上，别贴在牛皮纸、彩色底上：底色一变，对比度直接不够。</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 右：参数 + 动作 */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <BarcodeForm params={params} onChange={patch} />
        </div>

        {exportError && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-relaxed">{exportError}</span>
          </div>
        )}

        <Button
          size="lg"
          onClick={() => doExport()}
          disabled={!canExport}
          className="h-12 w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在导出…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              导出可打印标签
            </>
          )}
        </Button>

        {!user && (
          <p className="-mt-1 text-center text-[11px] text-slate-400">导出前需要登录（预览免费）</p>
        )}
        {user && !readable && !loading && (
          <p className="-mt-1 text-center text-[11px] text-slate-400">
            这组参数未通过扫码自检，暂不可导出
          </p>
        )}

        {result && <ResultCard result={result} onAgain={() => doExport()} canAgain={readable} />}
      </div>

      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        actionType="barcode_export"
        onSuccess={(orderId) => {
          setPayOpen(false);
          void doExport(orderId);
        }}
      />
    </div>
  );
};

/** 结果卡：PNG 直接打印，SVG 交印刷店排版 */
const ResultCard: React.FC<{
  result: BarcodeExportResult;
  onAgain: () => void;
  canAgain: boolean;
}> = ({ result, onAgain, canAgain }) => {
  const metrics = result.metrics;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-bold text-emerald-900">
          {result.cached ? '已导出过，直接给你上次那份' : '导出完成'}
        </p>
      </div>

      {metrics && (
        <p className="mt-1.5 font-mono text-[11px] text-emerald-800">
          {metrics.symbologyLabel} · {metrics.normalizedContent}
        </p>
      )}
      {metrics && (
        <p className="mt-0.5 font-mono text-[11px] text-emerald-700">
          实际 {metrics.widthMm.toFixed(1)} × {metrics.heightMm.toFixed(1)} mm · 每模块{' '}
          {metrics.modulePx}px · 放大 {(metrics.magnification * 100).toFixed(1)}%
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <a
          href={result.pngUrl}
          download
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          下载 PNG（{metrics?.dpi ?? 300} dpi，直接打印）
        </a>
        <a
          href={result.svgUrl}
          download
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          下载 SVG（矢量，交印刷店）
        </a>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onAgain}
        disabled={!canAgain}
        className="mt-2 h-9 w-full gap-1.5 border-emerald-300 text-xs text-emerald-800 hover:bg-emerald-100"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        再导出一份
      </Button>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        再次导出需要重新下单（每次导出单独扣费）。文件保留 7 天，请及时下载保存。
      </p>
    </div>
  );
};
