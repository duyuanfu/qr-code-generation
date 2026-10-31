/**
 * 服务端直连 Java 后端的轻量客户端。
 *
 * 说明：
 * - 浏览器侧的请求统一走 next.config.mjs 中的 rewrites 代理到 BACKEND_URL；
 * - 但 Server Component / generateMetadata 里 fetch 相对路径无法解析，
 *   因此在服务端直接命中 BACKEND_URL，避免多一跳。
 */

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/+$/, '');

export interface MediaItemRecord {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface DynamicQrRecord {
  id: string;
  shortCode: string;
  userId?: string | null;
  contentType: string;
  title: string;
  description?: string | null;
  /** Java 端以 JSON 字符串存库，取回后需二次解析 */
  mediaUrls?: string | null;
  styleConfig?: string | null;
  /** 服务到期时间（下单时的定价项 validMonths 决定），null 表示长期有效 */
  expiresAt?: string | null;
  createdAt?: string | null;
}

export type MediaContentType = 'image' | 'video' | 'pdf' | 'file';

/** 后端返回的 contentType 是自由字符串，收敛到落地页渲染层认识的四种类型 */
export function toMediaContentType(value: string | null | undefined): MediaContentType {
  return value === 'image' || value === 'video' || value === 'pdf' ? value : 'file';
}

/** 兼容处理 mediaUrls：既可能是 JSON 字符串，也可能已经是数组 */
export function parseMediaList(raw: unknown): MediaItemRecord[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MediaItemRecord[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 拉取动态活码元数据。
 * Java 端会在该 GET 请求上顺带写入一条扫码日志，因此需要把真实客户端
 * 的 UA / 来源 IP 透传过去，否则日志里只会记录到 Next 服务器的地址。
 *
 * 超时是必须的：扫码是站在路边等人的场景，后端一旦卡住，
 * 没有 signal 的话这个 Server Component 会一直挂着，用户看到的是纯白屏，
 * 连「二维码不存在」这种提示都等不到。
 */
export async function fetchDynamicQr(
  shortCode: string,
  forwardedHeaders?: HeadersInit
): Promise<DynamicQrRecord | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/qr/dynamic/${encodeURIComponent(shortCode)}`, {
      cache: 'no-store',
      headers: forwardedHeaders,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !json?.data) return null;
    return json.data as DynamicQrRecord;
  } catch {
    // 超时、连接被拒、JSON 解析失败都走这里 —— 统一当作「取不到」，
    // 由调用方走 not-found 边界，而不是把异常抛给 Next 变成 500 页
    return null;
  }
}

/** 从入站请求里挑出需要透传给后端的头 */
export function forwardedScanHeaders(getHeader: (name: string) => string | null): Record<string, string> {
  const result: Record<string, string> = {};
  const ua = getHeader('user-agent');
  if (ua) result['user-agent'] = ua;
  const ip = getHeader('x-forwarded-for') || getHeader('x-real-ip');
  if (ip) result['x-forwarded-for'] = ip;
  return result;
}
