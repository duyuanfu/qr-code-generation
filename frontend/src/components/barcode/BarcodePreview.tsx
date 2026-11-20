'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ScanBarcode } from 'lucide-react';
import type { BarcodePreviewResult } from '@/types/barcode';

interface Props {
  preview: BarcodePreviewResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * 预览。
 *
 * <p>图是服务端按「每模块 1 像素」出的，前端用 `image-rendering: pixelated` 放大 ——
 * 条的边缘仍是硬边、结构完全真实，所以码制选错、少填一位数字一眼就能看出来。
 * 但 117px 宽印在 40mm 上只有 74dpi，**这个分辨率打不出能读的标签**，
 * 付费墙因此不需要水印。
 */
export const BarcodePreview: React.FC<Props> = ({ preview, loading, error }) => {
  const metrics = preview?.metrics;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ScanBarcode className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-900">标签预览</h3>
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />}
      </div>

      <div className="mt-3 flex min-h-[150px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-3">
        {error ? (
          <p className="px-3 text-center text-xs leading-relaxed text-rose-600">{error}</p>
        ) : preview?.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.dataUrl}
            alt="条形码预览"
            className="block w-full max-w-full"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <p className="text-xs text-slate-400">
            {loading ? '正在生成预览…' : '填写内容后这里会显示条形码'}
          </p>
        )}
      </div>

      {metrics && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <dt className="text-slate-500">实际尺寸</dt>
              <dd className="font-mono font-semibold text-slate-800">
                {metrics.widthMm.toFixed(1)} × {metrics.heightMm.toFixed(1)} mm
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">每模块</dt>
              <dd className="font-mono font-semibold text-slate-800">{metrics.modulePx} px</dd>
            </div>
            <div>
              <dt className="text-slate-500">放大倍率</dt>
              <dd className="font-mono font-semibold text-slate-800">
                {(metrics.magnification * 100).toFixed(1)}%
              </dd>
            </div>
          </dl>

          {preview?.readable ? (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              已通过扫码自检（含 70% 缩小 + 模糊的劣化测试）
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {preview?.reason ?? '这组参数印出来可能读不出，请加宽标签或提高 DPI'}
            </p>
          )}

          {metrics.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 px-2.5 py-2">
              {metrics.warnings.map((w, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-amber-800">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
