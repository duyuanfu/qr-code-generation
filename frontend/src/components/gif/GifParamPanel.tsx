'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { GifParams } from '@/types/gif';

interface Props {
  params: GifParams;
  onChange: (patch: Partial<GifParams>) => void;
}

/** 带数值显示的滑块 */
const Slider: React.FC<{
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, hint, value, min, max, step, format, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      <span className="font-mono text-xs font-medium text-blue-600">
        {format ? format(value) : value}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
    />
    {hint && <p className="text-[11px] leading-relaxed text-slate-400">{hint}</p>}
  </div>
);

/**
 * 参数面板。
 *
 * <p>默认只暴露四件用户真正关心的事：文案、倒计时长度、二维码多大、二维码多淡。
 * 四角系数、衬底不透明度、虚化半径这些旋钮放「高级」里 —— 它们决定「能不能扫」，
 * 但普通用户调不动也不该调，出问题时用一键应用建议值解决。
 */
export const GifParamPanel: React.FC<Props> = ({ params, onChange }) => {
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-900">文案</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">倒计时文字</label>
          <Input
            value={params.countdownTemplate}
            onChange={(e) => onChange({ countdownTemplate: e.target.value })}
            placeholder="等待{n}秒"
            maxLength={20}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-slate-400">
            用 <code className="rounded bg-slate-100 px-1">{'{n}'}</code> 表示剩余秒数
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">二维码下方说明</label>
          <Input
            value={params.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="截图保存，扫一扫"
            maxLength={24}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-slate-400">
            留空则不显示；字号与倒计时文字一致，太长时自动缩小以放得下
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">节奏</h3>
        <Slider
          label="倒计时"
          hint="0 表示不要倒计时，直接淡入二维码"
          value={params.waitSeconds}
          min={0}
          max={10}
          step={1}
          format={(v) => `${v} 秒`}
          onChange={(v) => onChange({ waitSeconds: v })}
        />
        <Slider
          label="二维码停留时长"
          value={params.holdSeconds}
          min={0.4}
          max={5}
          step={0.1}
          format={(v) => `${v.toFixed(1)} 秒`}
          onChange={(v) => onChange({ holdSeconds: v })}
        />
      </section>

      <section className="flex flex-col gap-4 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">二维码</h3>
        <Slider
          label="尺寸"
          value={params.qrSize}
          min={240}
          max={480}
          step={10}
          format={(v) => `${v}px`}
          onChange={(v) => onChange({ qrSize: v })}
        />
        <Slider
          label="浓度"
          hint="二维码墨色的不透明度：100% 和原图一样实，越低越透出底图。四角还会再乘一次「四角系数」"
          value={params.qrOpacity}
          min={0.2}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ qrOpacity: v })}
        />
        <p className="text-[11px] text-slate-400">在左侧画面上直接拖拽可调整位置</p>
      </section>

      <section className="border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-bold text-slate-900"
        >
          <span>高级参数</span>
          {advanced ? (
            <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
        </button>

        {advanced && (
          <div className="mt-4 flex flex-col gap-4">
            <Slider
              label="四角系数"
              hint="定位图案的淡化程度，低于 0.6 大概率扫不出"
              value={params.cornerMult}
              min={0.3}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onChange({ cornerMult: v })}
            />
            <Slider
              label="衬底不透明度"
              hint="-1 为自动（按二维码底下的明暗决定）"
              value={params.haloAlpha}
              min={-1}
              max={1}
              step={0.01}
              format={(v) => (v < 0 ? '自动' : v.toFixed(2))}
              onChange={(v) => onChange({ haloAlpha: v })}
            />
            <Slider
              label="虚化"
              hint="-1 为自动（随二维码尺寸等比）"
              value={params.blur}
              min={-1}
              max={2}
              step={0.05}
              format={(v) => (v < 0 ? '自动' : v.toFixed(2))}
              onChange={(v) => onChange({ blur: v })}
            />
            <Slider
              label="画布尺寸"
              hint="越大越清晰，体积也越大"
              value={params.outputSize}
              min={480}
              max={1080}
              step={40}
              format={(v) => `${v}px`}
              onChange={(v) => onChange({ outputSize: v })}
            />
            <Slider
              label="体积上限"
              hint="超出后会自动降低画布尺寸重编"
              value={params.targetSizeMb}
              min={0.5}
              max={8}
              step={0.5}
              format={(v) => `${v} MB`}
              onChange={(v) => onChange({ targetSizeMb: v })}
            />
            <Slider
              label="淡入时长"
              value={params.fadeSeconds}
              min={0.3}
              max={3}
              step={0.1}
              format={(v) => `${v.toFixed(1)} 秒`}
              onChange={(v) => onChange({ fadeSeconds: v })}
            />
          </div>
        )}
      </section>
    </div>
  );
};
