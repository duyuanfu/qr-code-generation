'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  DPI_OPTIONS,
  LABEL_PRESETS,
  SYMBOLOGY_META,
  type BarcodeParams,
  type BarcodeSymbology,
} from '@/types/barcode';
import { lengthHint } from '@/lib/barcode-format';

interface Props {
  params: BarcodeParams;
  onChange: (patch: Partial<BarcodeParams>) => void;
}

const SYMBOLOGIES: BarcodeSymbology[] = ['EAN_13', 'EAN_8', 'UPC_A', 'CODE_128', 'CODE_39'];

/**
 * 参数面板。
 *
 * <p>条形码没有「样式」可调 —— 换色、圆角、叠图全部会让激光枪读不出。所以这里只有
 * 四件事：编码方式、内容、印多大、打多细。整个面板的复杂度还不到 GIF 的一半，
 * 这是产品的正确形态，不是没做完。
 */
export const BarcodeForm: React.FC<Props> = ({ params, onChange }) => {
  const meta = SYMBOLOGY_META[params.symbology];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-slate-900">码制</h3>
        <div className="grid grid-cols-2 gap-2">
          {SYMBOLOGIES.map((s) => {
            const active = params.symbology === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ symbology: s, content: '' })}
                className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span
                  className={`block text-xs font-bold ${active ? 'text-blue-700' : 'text-slate-800'}`}
                >
                  {SYMBOLOGY_META[s].label}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {SYMBOLOGY_META[s].scene}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5 border-t border-slate-100 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="barcode-content" className="text-xs font-semibold text-slate-700">
            内容
          </label>
          <span className="font-mono text-[11px] text-slate-400">{lengthHint(params)}</span>
        </div>
        <Input
          id="barcode-content"
          value={params.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder={meta.placeholder}
          className="h-10 font-mono text-sm tracking-wide"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[11px] leading-relaxed text-slate-400">{meta.hint}</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">标签尺寸</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {LABEL_PRESETS.map((p) => {
            const active = params.labelWidthMm === p.width && params.labelHeightMm === p.height;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange({ labelWidthMm: p.width, labelHeightMm: p.height })}
                className={`rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">宽度（mm）</span>
            <Input
              type="number"
              min={15}
              max={200}
              value={Number.isFinite(params.labelWidthMm) ? params.labelWidthMm : ''}
              onChange={(e) => onChange({ labelWidthMm: Number(e.target.value) })}
              className="h-9 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">高度（mm）</span>
            <Input
              type="number"
              min={10}
              max={150}
              value={Number.isFinite(params.labelHeightMm) ? params.labelHeightMm : ''}
              onChange={(e) => onChange({ labelHeightMm: Number(e.target.value) })}
              className="h-9 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-500">打印精度</span>
          <div className="grid grid-cols-3 gap-1.5">
            {DPI_OPTIONS.map((d) => {
              const active = params.dpi === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onChange({ dpi: d.value })}
                  title={d.hint}
                  className={`rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {DPI_OPTIONS.find((d) => d.value === params.dpi)?.hint}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">标签文字</h3>

        <button
          type="button"
          role="switch"
          aria-checked={params.showText}
          onClick={() => onChange({ showText: !params.showText })}
          className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left transition-colors hover:border-slate-300"
        >
          <span>
            <span className="block text-xs font-semibold text-slate-800">显示数字</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              收银核对、理货盘点要用，建议开启
            </span>
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              params.showText ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                params.showText ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="barcode-caption" className="text-xs font-semibold text-slate-700">
            备注（可选）
          </label>
          <Input
            id="barcode-caption"
            value={params.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="商品名 / 规格 / 货位"
            maxLength={40}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-slate-400">印在数字下方，超出标签宽度会被截断</p>
        </div>
      </section>
    </div>
  );
};
