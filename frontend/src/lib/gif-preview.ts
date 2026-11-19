import { GIF_FPS, gifTimeline, type GifParams } from '@/types/gif';

/**
 * 前端预览渲染。
 *
 * <p>与服务端 Java2D 走同一套几何公式（cover 裁切、衬底羽化、四角淡化、
 * `ease_out` 曲线、锚点定位），目的是「所见接近所得」。但不可能逐像素一致：
 * 文字抗锯齿、模糊核实现、字体都不同。界面上明确写「近似预览」。
 *
 * <p>性能上把重活全部预渲染成离屏 canvas：117 帧里每帧只做 3 次 drawImage。
 * 如果每帧都重算一次 27px 的模糊，800×800 的 canvas 会直接掉到个位数帧率。
 */

export interface PreviewAssets {
  size: number;
  /** cover 之后的底图 */
  base: HTMLCanvasElement;
  /** 衬底 + 二维码（已含羽化与虚化） */
  qrLayer: HTMLCanvasElement;
  /** 倒计时文字层缓存，key 为文案 */
  countdown: Map<string, TextLayer>;
  caption: TextLayer | null;
  /** 浏览器是否支持 canvas filter；不支持时模糊全部降级为 0 */
  supportsFilter: boolean;
}

interface TextLayer {
  canvas: HTMLCanvasElement;
  baselineX: number;
  baselineY: number;
}

/** 800 基准下的字号与位置，与后端 FrameComposer 对齐 */
const COUNTDOWN_FONT = 80;
const CAPTION_FONT = 40;
const COUNTDOWN_POS = { x: 52, y: 46 };
const CAPTION_POS = { x: 400, y: 40 };

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function filterSupported(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.filter = 'blur(1px)';
    const ok = ctx.filter !== 'none' && ctx.filter !== '';
    ctx.filter = 'none';
    return ok;
  } catch {
    return false;
  }
}

/** cover：铺满并居中裁切，与后端 ImageOps.cover 一致 */
function coverDraw(target: HTMLCanvasElement, img: HTMLImageElement, size: number) {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
}

/**
 * 二维码去白底。
 *
 * <p>与后端同一套反推公式：`alpha = 255 - min(r,g,b)`，再 `rgb = (rgb - 255(1-a)) / a`。
 * 少了反推这一步，半透明边缘会发灰、看着脏。
 */
function extractQrAlpha(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 先拍平到白底：源图可能自带透明通道
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const min = Math.min(r, g, b);
    const alpha = 255 - min;
    if (alpha <= 0) {
      px[i + 3] = 0;
      continue;
    }
    const af = alpha / 255;
    px[i] = clamp255((r - 255 * (1 - af)) / af);
    px[i + 1] = clamp255((g - 255 * (1 - af)) / af);
    px[i + 2] = clamp255((b - 255 * (1 - af)) / af);
    px[i + 3] = alpha;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 文字层：描边 + 可选投影，返回基线与画布，供锚点对齐 */
function makeTextLayer(
  text: string,
  fontSize: number,
  strokeWidth: number,
  withShadow: boolean
): TextLayer {
  const font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`;
  const measure = createCanvas(8, 8);
  const mctx = measure.getContext('2d')!;
  mctx.font = font;
  const metrics = mctx.measureText(text);
  const width = metrics.width;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.85;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25;

  const pad = Math.ceil(strokeWidth + (withShadow ? 10 : 0) + 4);
  const canvas = createCanvas(width + pad * 2, ascent + descent + pad * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const bx = pad;
  const by = pad + ascent;

  if (withShadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = fontSize * 0.05;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(text, bx, by);
    ctx.restore();
  }

  if (strokeWidth > 0) {
    ctx.strokeStyle = 'rgba(25,25,25,0.92)';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, bx, by);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, bx, by);

  return { canvas, baselineX: bx, baselineY: by };
}

/** 按锚点贴文字层：lb 左下 / mb 中下 */
function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  anchor: 'lb' | 'mb',
  x: number,
  y: number,
  alpha: number
) {
  if (alpha <= 0.001) return;
  const dx = anchor === 'mb' ? x - layer.baselineX - layer.canvas.width / 2 : x - layer.baselineX;
  const dy = y - layer.baselineY;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(layer.canvas, dx, dy);
  ctx.restore();
}

/** 计算 800 基准尺寸在当前画布上的实际值 */
export function scaledMetrics(params: GifParams) {
  const s = params.outputSize / 800;
  const qrPx = Math.round(params.qrSize * s);
  return {
    scale: s,
    qrPx,
    haloPad: Math.round(qrPx * 0.09),
    haloFeather: Math.max(10 * s, qrPx * 0.085),
    blurRadius: ((params.blur < 0 ? 0.85 : params.blur) * qrPx) / 320,
  };
}

/**
 * 预构建所有静态素材。参数变化时重建一次，播放循环里不再碰它。
 */
export function buildPreviewAssets(
  params: GifParams,
  bg: HTMLImageElement,
  qr: HTMLImageElement
): PreviewAssets {
  const size = params.outputSize;
  const meter = scaledMetrics(params);
  const { qrPx, haloPad, haloFeather, blurRadius } = meter;
  const haloSize = qrPx + haloPad * 2;

  const probe = createCanvas(8, 8).getContext('2d')!;
  const supportsFilter = filterSupported(probe);

  const base = createCanvas(size, size);
  coverDraw(base, bg, size);

  // 衬底：留 margin 才有羽化空间，和后端踩过的是同一个坑
  const margin = Math.ceil(haloFeather * 2) + 2;
  const haloWork = createCanvas(haloSize + margin * 2, haloSize + margin * 2);
  const hctx = haloWork.getContext('2d')!;
  hctx.filter = supportsFilter ? `blur(${haloFeather}px)` : 'none';
  hctx.fillStyle = `rgba(255,255,255,${params.haloAlpha < 0 ? 1 : params.haloAlpha})`;
  const radius = haloSize * 0.06;
  hctx.beginPath();
  hctx.roundRect(margin, margin, haloSize, haloSize, radius);
  hctx.fill();
  hctx.filter = 'none';

  // 二维码本体：先去白底，再按 opacity 与四角系数绘制
  const qrCanvas = extractQrAlpha(qr, qrPx);
  const qctx = haloWork.getContext('2d')!;
  qctx.save();
  qctx.globalAlpha = params.qrOpacity;
  qctx.drawImage(qrCanvas, margin + haloPad, margin + haloPad);

  // 四角淡化：用径向渐变做 destination-out，边缘自然过渡
  const box = qrPx * 0.3;
  const reduce = Math.max(0, 1 - params.cornerMult);
  if (reduce > 0.01) {
    qctx.globalCompositeOperation = 'destination-out';
    const corners = [
      [margin + haloPad, margin + haloPad],
      [margin + haloPad + qrPx, margin + haloPad],
      [margin + haloPad, margin + haloPad + qrPx],
      [margin + haloPad + qrPx, margin + haloPad + qrPx],
    ];
    for (const [cx, cy] of corners) {
      const g = qctx.createRadialGradient(cx, cy, 0, cx, cy, box * 1.5);
      g.addColorStop(0, `rgba(0,0,0,${reduce})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      qctx.fillStyle = g;
      qctx.fillRect(cx - box * 1.5, cy - box * 1.5, box * 3, box * 3);
    }
  }
  qctx.restore();

  // 整层虚化后裁回 haloSize
  const qrLayer = createCanvas(haloSize, haloSize);
  const lctx = qrLayer.getContext('2d')!;
  if (supportsFilter && blurRadius > 0.1) {
    // 先模糊再裁：canvas 的 filter 作用于绘制瞬间，所以模糊画大图、裁小图
    const blurred = createCanvas(haloWork.width, haloWork.height);
    const bctx = blurred.getContext('2d')!;
    bctx.filter = `blur(${blurRadius}px)`;
    bctx.drawImage(haloWork, 0, 0);
    bctx.filter = 'none';
    lctx.drawImage(blurred, -margin, -margin);
  } else {
    lctx.drawImage(haloWork, -margin, -margin);
  }

  return {
    size,
    base,
    qrLayer,
    countdown: new Map(),
    caption:
      params.caption.trim().length > 0
        ? makeTextLayer(params.caption, CAPTION_FONT * meter.scale, Math.max(2, 5 * meter.scale), false)
        : null,
    supportsFilter,
  };
}

/** 取（或惰性构建）倒计时文字层 */
function countdownLayer(assets: PreviewAssets, text: string, params: GifParams): TextLayer {
  const cached = assets.countdown.get(text);
  if (cached) return cached;
  const s = params.outputSize / 800;
  const layer = makeTextLayer(text, COUNTDOWN_FONT * s, Math.max(2, 5 * s), true);
  assets.countdown.set(text, layer);
  return layer;
}

/** 渲染第 frameIndex 帧 */
export function drawPreviewFrame(
  ctx: CanvasRenderingContext2D,
  assets: PreviewAssets,
  params: GifParams,
  frameIndex: number
) {
  const size = assets.size;
  const timeline = gifTimeline(params);
  const s = size / 800;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(assets.base, 0, 0);

  if (frameIndex < timeline.countdown) {
    const segment = Math.floor(frameIndex / GIF_FPS);
    const n = Math.max(1, Math.round(params.waitSeconds) - segment);
    const text = params.countdownTemplate.replace('{n}', String(n));
    const layer = countdownLayer(assets, text, params);
    drawTextLayer(
      ctx,
      layer,
      'lb',
      COUNTDOWN_POS.x * s,
      size - COUNTDOWN_POS.y * s,
      1
    );
    return;
  }

  const local = frameIndex - timeline.countdown;
  const t = local >= timeline.fade ? 1 : local / timeline.fade;
  const ease = 1 - Math.pow(1 - t, 2.2);
  const alpha = ease;
  const scale = 0.92 + 0.08 * ease;

  if (alpha > 0.001) {
    const full = assets.qrLayer.width;
    const sz = full * scale;
    const cx = size / 2 + params.qrOffsetX * size;
    const cy = size / 2 + params.qrOffsetY * size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(assets.qrLayer, cx - sz / 2, cy - sz / 2, sz, sz);
    ctx.restore();
  }

  if (assets.caption) {
    const captionAlpha = Math.max(0, Math.min(1, (alpha - 0.05) / 0.6));
    drawTextLayer(
      ctx,
      assets.caption,
      'mb',
      size / 2,
      size - CAPTION_POS.y * s,
      captionAlpha
    );
  }
}
