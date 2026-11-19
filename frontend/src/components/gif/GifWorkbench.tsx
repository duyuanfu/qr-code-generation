'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  QrCode,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentModal } from '@/components/workspace/PaymentModal';
import { GifCanvasPreview } from '@/components/gif/GifCanvasPreview';
import { GifParamPanel } from '@/components/gif/GifParamPanel';
import { useAuth } from '@/components/auth/AuthContext';
import { authHeaders, uploadSingleFile } from '@/lib/api-client';
import { buildPreviewAssets, loadImage, type PreviewAssets } from '@/lib/gif-preview';
import {
  DEFAULT_GIF_PARAMS,
  type GifParams,
  type GifSuggestion,
  type GenerateResult,
  type PrecheckResult,
} from '@/types/gif';

interface ApiEnvelope<T> {
  ok: boolean;
  code: number;
  message: string;
  data: T | null;
}

/** 提交 GIF 请求；失败时把 code 与 data（建议值）一并带回来 */
async function postGif<T>(path: string, body: unknown): Promise<ApiEnvelope<T>> {
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

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

export const GifWorkbench: React.FC = () => {
  const { user, openAuthModal } = useAuth();

  const [params, setParams] = useState<GifParams>(DEFAULT_GIF_PARAMS);
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [qrImg, setQrImg] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState<'bg' | 'qr' | null>(null);

  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<GifSuggestion | null>(null);
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const [payOpen, setPayOpen] = useState(false);

  const paramsRef = useRef(params);
  paramsRef.current = params;

  const patch = useCallback((p: Partial<GifParams>) => {
    setParams((prev) => ({ ...prev, ...p }));
  }, []);

  /**
   * 素材只在「影响像素的那些参数」变化时重建。
   *
   * <p>拖拽二维码位置时 params 整体在变，但位置是在 drawPreviewFrame 里
   * 实时应用的，不需要重建衬底与模糊 —— 否则每拖一像素都重算一次 27px 模糊。
   */
  const assetKey = [
    params.outputSize,
    params.qrSize,
    params.qrOpacity,
    params.cornerMult,
    params.haloAlpha,
    params.blur,
  ].join('|');

  const assets: PreviewAssets | null = useMemo(() => {
    if (!bgImg || !qrImg) return null;
    try {
      return buildPreviewAssets(paramsRef.current, bgImg, qrImg);
    } catch (e) {
      console.error('预览构建失败', e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey, bgImg, qrImg]);

  // 换了底图/二维码就清掉上一版结果，避免用户以为结果已更新
  useEffect(() => {
    setResult(null);
    setError(null);
    setSuggestion(null);
  }, [params.backgroundUrl, params.qrUrl]);

  const handleUpload = async (kind: 'bg' | 'qr', file: File) => {
    if (!user) {
      openAuthModal();
      return;
    }
    setUploading(kind);
    setError(null);

    // 先用本地文件渲染预览：上传可能几百毫秒到几秒，没必要让用户干等
    const localUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(localUrl);
      if (kind === 'bg') setBgImg(img);
      else setQrImg(img);
    } catch {
      setError('图片读取失败，请换一张试试');
      URL.revokeObjectURL(localUrl);
      setUploading(null);
      return;
    }

    try {
      const url = await uploadSingleFile(file);
      patch(kind === 'bg' ? { backgroundUrl: url } : { qrUrl: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(null);
      // 预览已经用 img 元素持有解码后的位图，可以释放 blob 地址
      setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
    }
  };

  const ready = Boolean(params.backgroundUrl && params.qrUrl && assets);

  /** 走完整流程：预检 → （需要时）支付 → 生成 */
  const runGenerate = async (orderId?: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (!ready) {
      setError('请先上传底图与二维码图片');
      return;
    }

    setError(null);
    setSuggestion(null);
    setSuggestionReason(null);

    // 1. 预检：免费、约半秒，把「扫不出来」挡在付费之前
    if (!orderId) {
      setChecking(true);
      try {
        const pre = await postGif<PrecheckResult>('/api/gif/precheck', params);
        if (!pre.ok) {
          setError(pre.message);
          return;
        }
        const check = pre.data;
        if (check && !check.ok) {
          setSuggestionReason(check.reason);
          setSuggestion(check.suggestion);
          setError(null);
          return;
        }
      } finally {
        setChecking(false);
      }
    }

    // 2. 生成（未付费会被 402 拦回，此时再拉起支付）
    setGenerating(true);
    try {
      const res = await postGif<GenerateResult>('/api/gif/generate', { ...params, orderId });
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
      if (res.code === 422) {
        setSuggestion((res.data as unknown as GifSuggestion) ?? null);
        setSuggestionReason(res.message);
        return;
      }
      setError(res.message || '生成失败');
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    patch({
      cornerMult: suggestion.cornerMult,
      qrOpacity: suggestion.qrOpacity,
      qrSize: suggestion.qrSize,
    });
    setSuggestion(null);
    setSuggestionReason(null);
    setError(null);
  };

  const busy = checking || generating;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:py-8">
      {/* 左：上传 + 预览 */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <UploadCard
            label="底图"
            hint="海报、名片、产品图都可以，会自动裁成正方形"
            url={params.backgroundUrl}
            icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}
            loading={uploading === 'bg'}
            onPick={(f) => handleUpload('bg', f)}
          />
          <UploadCard
            label="二维码"
            hint="黑码白底的清晰截图，会在动图里淡入"
            url={params.qrUrl}
            icon={<QrCode className="h-4 w-4" aria-hidden="true" />}
            loading={uploading === 'qr'}
            onPick={(f) => handleUpload('qr', f)}
          />
        </div>

        <GifCanvasPreview params={params} assets={assets} onChange={patch} />

        <p className="text-[11px] leading-relaxed text-slate-400">
          预览为近似效果（浏览器与服务端的模糊、字体实现不同），最终以生成结果为准。
          二维码在动图中会被淡化，请以「生成结果」里的可扫性校验为准。
        </p>
      </div>

      {/* 右：参数 + 动作 */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <GifParamPanel params={params} onChange={patch} />
        </div>

        {suggestion && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-amber-900">当前参数扫不出来</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  {suggestionReason || '二维码对比度不足，建议提高浓度与四角系数。'}
                </p>
                <p className="mt-2 font-mono text-[11px] text-amber-700">
                  四角 {suggestion.cornerMult.toFixed(2)} · 浓度{' '}
                  {Math.round(suggestion.qrOpacity * 100)}% · 尺寸 {suggestion.qrSize}px
                </p>
                <Button
                  size="sm"
                  onClick={applySuggestion}
                  className="mt-2 h-8 gap-1.5 bg-amber-600 text-xs text-white hover:bg-amber-700"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  一键应用建议值
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <Button
          size="lg"
          onClick={() => runGenerate()}
          disabled={!ready || busy}
          className="h-12 w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {checking ? '正在检查可扫性…' : '正在生成，约需 6~10 秒…'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              生成 GIF 动图
            </>
          )}
        </Button>

        {result && <ResultCard result={result} onRegenerate={() => runGenerate()} />}
      </div>

      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        actionType="gif_export"
        onSuccess={(orderId) => {
          setPayOpen(false);
          void runGenerate(orderId);
        }}
      />
    </div>
  );
};

/** 上传卡片：有图时显示缩略图与「重新选择」 */
const UploadCard: React.FC<{
  label: string;
  hint: string;
  url: string;
  icon: React.ReactNode;
  loading: boolean;
  onPick: (file: File) => void;
}> = ({ label, hint, url, icon, loading, onPick }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </span>
        {label}
      </div>

      {url ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* 本地 /uploads 资源，不需要 next/image 优化 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="h-full w-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
          >
            {loading ? '上传中…' : '重新选择'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex h-14 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {loading ? '上传中…' : '点击上传（JPG / PNG）'}
        </button>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
};

/** 结果卡片：直接放后端产出的 GIF，附体积与校验结论 */
const ResultCard: React.FC<{ result: GenerateResult; onRegenerate: () => void }> = ({
  result,
  onRegenerate,
}) => {
  const meta = result.meta;
  const attempts = meta.attempts ?? [];
  const warnings = meta.warnings ?? [];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-bold text-emerald-900">
          {meta.cached ? '已生成过，直接给你上次那份' : '生成完成'}
        </p>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.url} alt="生成的二维码动图" className="block w-full" />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-slate-500">体积</dt>
          <dd className="font-mono font-semibold text-slate-800">
            {meta.bytes ? `${formatMb(meta.bytes)} MB` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">时长 / 帧数</dt>
          <dd className="font-mono font-semibold text-slate-800">
            {meta.duration ? `${meta.duration}s / ${meta.frames} 帧` : '—'}
          </dd>
        </div>
      </dl>

      {attempts.length > 0 && (
        <div className="mt-3 rounded-lg bg-white/70 px-2.5 py-2">
          <p className="text-[11px] font-medium text-slate-600">已自动调整 {attempts.length} 次</p>
          <ul className="mt-1 space-y-0.5">
            {attempts.map((line, i) => (
              <li key={i} className="font-mono text-[10px] leading-relaxed text-slate-500">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.map((w, i) => (
        <p key={i} className="mt-2 text-[11px] text-amber-700">
          {w}
        </p>
      ))}

      <div className="mt-3 flex gap-2">
        <a
          href={result.url}
          download
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          下载 GIF
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          className="h-9 gap-1.5 border-emerald-300 text-xs text-emerald-800 hover:bg-emerald-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          再生成一版
        </Button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        再生成需要重新下单（每次生成单独扣费）。文件保留 7 天，请及时下载保存。
      </p>
    </div>
  );
};
