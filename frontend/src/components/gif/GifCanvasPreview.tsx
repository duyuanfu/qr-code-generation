'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Move } from 'lucide-react';
import { drawPreviewFrame, type PreviewAssets } from '@/lib/gif-preview';
import { GIF_FPS, gifTimeline, type GifParams } from '@/types/gif';

interface Props {
  params: GifParams;
  assets: PreviewAssets | null;
  onChange: (patch: Partial<GifParams>) => void;
}

/**
 * Canvas 实时预览。
 *
 * <p>为什么是动画而不是一张静态图：这段素材的卖点就是「先吊 3 秒再淡入」，
 * 静态图只能看到末态，用户没法判断倒计时节奏对不对。
 *
 * <p>进度条用 ref 直接改样式而不是 setState —— 25fps 下每秒 25 次重渲染
 * 会把整个参数面板一起拖垮。
 */
export const GifCanvasPreview: React.FC<Props> = ({ params, assets, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);

  const timeline = useMemo(
    () => gifTimeline(params),
    [params.waitSeconds, params.fadeSeconds, params.holdSeconds]
  );

  const paint = useCallback(
    (frame: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !assets) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawPreviewFrame(ctx, assets, params, frame);
      if (progressRef.current) {
        const pct = ((frame + 1) / timeline.total) * 100;
        progressRef.current.style.width = `${pct}%`;
      }
    },
    [assets, params, timeline.total]
  );

  // 参数或素材变化时立刻重画当前帧，避免停顿一拍
  useEffect(() => {
    if (frameRef.current >= timeline.total) frameRef.current = 0;
    paint(frameRef.current);
  }, [paint, timeline.total]);

  // 播放循环
  useEffect(() => {
    if (!assets) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      if (playing && !dragging) {
        acc += dt;
        const frameMs = 1000 / GIF_FPS;
        if (acc >= frameMs) {
          const advance = Math.floor(acc / frameMs);
          acc -= advance * frameMs;
          frameRef.current = (frameRef.current + advance) % timeline.total;
          paint(frameRef.current);
        }
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [assets, playing, dragging, paint, timeline.total]);

  /** 把指针位置换算成相对画布中心的偏移比例 */
  const pointerRatio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointerRatio(e);
    dragRef.current = { px: p.x, py: p.y, ox: params.qrOffsetX, oy: params.qrOffsetY };
    setDragging(true);
    // 拖拽时直接跳到末帧，否则用户是在半透明的二维码上找位置
    frameRef.current = timeline.total - 1;
    paint(frameRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const p = pointerRatio(e);
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    onChange({
      qrOffsetX: clamp(start.ox + (p.x - start.px)),
      qrOffsetY: clamp(start.oy + (p.y - start.py)),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
        <canvas
          ref={canvasRef}
          width={params.outputSize}
          height={params.outputSize}
          className="block aspect-square h-auto w-full max-w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {!assets && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 text-sm text-slate-500">
            上传底图与二维码后开始预览
          </div>
        )}
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-slate-900/55 px-2 py-1 text-[11px] font-medium text-white">
          <Move className="h-3 w-3" aria-hidden="true" />
          拖拽调整二维码位置
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? '暂停预览' : '播放预览'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div ref={progressRef} className="h-full rounded-full bg-blue-500" style={{ width: '0%' }} />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-slate-500">
          {(timeline.total / GIF_FPS).toFixed(2)}s
        </span>
      </div>
    </div>
  );
};
