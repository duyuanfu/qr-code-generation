/**
 * 浏览器侧请求封装。
 *
 * 前端通过 next.config.mjs 的 rewrites 把 /api/** 代理到 Java 后端，
 * 这里只负责统一挂上 Authorization 头并拆解后端的 Result 结构：
 *   { success, code, message, data }
 */

export class ApiError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** 需要登录态的普通 fetch 可用它取到带 Bearer 的请求头 */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiFetch<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, { ...init, headers, cache: 'no-store' });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`服务响应异常 (HTTP ${res.status})`, res.status);
  }

  if (!json || json.success !== true) {
    throw new ApiError(json?.message || `请求失败 (HTTP ${res.status})`, json?.code ?? res.status);
  }

  return json.data as T;
}

/** 上传单个文件，返回后端去重后的访问地址 */
export async function uploadSingleFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('files', file);

  const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: formData });
  const json = await res.json().catch(() => null);

  if (!json?.success || !json?.files?.length) {
    if (res.status === 401) throw new ApiError('上传前请先登录', 401);
    if (res.status === 413) {
      throw new ApiError(json?.error || json?.message || '文件超过大小上限，请压缩后重试', 413);
    }
    if (res.status === 429) throw new ApiError(json?.message || '上传过于频繁，请稍后再试', 429);
    throw new ApiError(json?.error || json?.message || '文件上传失败', res.status);
  }

  return json.files[0].url as string;
}
