/** GIF 动图导出的请求与响应类型，与后端 GifOptions 一一对应 */

export interface GifParams {
  backgroundUrl: string;
  qrUrl: string;
  caption: string;
  countdownTemplate: string;
  waitSeconds: number;
  fadeSeconds: number;
  holdSeconds: number;
  qrOffsetX: number;
  qrOffsetY: number;
  qrSize: number;
  qrOpacity: number;
  cornerMult: number;
  /** -1 表示按底图亮度自动选 */
  haloAlpha: number;
  /** -1 表示按 qrSize 等比 */
  blur: number;
  outputSize: number;
  targetSizeMb: number;
}

export const DEFAULT_GIF_PARAMS: GifParams = {
  backgroundUrl: '',
  qrUrl: '',
  caption: '截图保存，扫一扫',
  countdownTemplate: '等待{n}秒',
  waitSeconds: 3,
  fadeSeconds: 1.2,
  holdSeconds: 0.5,
  qrOffsetX: 0,
  qrOffsetY: -0.025,
  qrSize: 320,
  qrOpacity: 0.7,
  cornerMult: 0.85,
  haloAlpha: -1,
  blur: -1,
  outputSize: 800,
  targetSizeMb: 2,
};

/** 后端 GifOptions 的常量，前端预览要用同一套时间轴 */
export const GIF_FPS = 25;

export interface GifSuggestion {
  cornerMult: number;
  qrOpacity: number;
  qrSize: number;
}

export interface PrecheckResult {
  ok: boolean;
  reason: string | null;
  suggestion: GifSuggestion | null;
  millis: number;
}

/** 「去掉中间图案」的结果：重绘后的新图地址 + 解出来的原始内容 */
export interface CleanQrResult {
  url: string;
  content: string;
  size: number;
}

export interface GifMeta {
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  bytes: number;
  qrBox: [number, number, number, number];
  qrSize: number;
  qrOpacity: number;
  cornerMult: number;
  blur: number;
  attempts: string[];
  warnings: string[];
  renderMillis: number;
  cached?: boolean;
}

export interface GenerateResult {
  url: string;
  meta: GifMeta;
  scanCheck: Record<string, boolean>;
}

/** 时间轴三段，预览与后端共用同一套换算 */
export function gifTimeline(params: Pick<GifParams, 'waitSeconds' | 'fadeSeconds' | 'holdSeconds'>) {
  const countdown = Math.max(0, Math.round(params.waitSeconds)) * GIF_FPS;
  const fade = Math.max(1, Math.round(params.fadeSeconds * GIF_FPS));
  const hold = Math.max(10, Math.floor(params.holdSeconds * GIF_FPS));
  return { countdown, fade, hold, total: countdown + fade + hold };
}
