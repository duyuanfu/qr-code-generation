/**
 * 媒体类型判定：扩展名与 MIME 双保险。
 *
 * 为什么不只看 MIME：上传接口返回的 `type` 有时是空串（浏览器识别不出），
 * 而 `/uploads/<sha256>.<ext>` 的扩展名一定是后端按真实内容写出来的，更可信。
 */
import { isPdfFile } from './pdf-helpers';

type MediaLike = { name?: string; type?: string; url?: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)($|\?)/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|ogg)($|\?)/i;

export function isImageFile(item: MediaLike): boolean {
  if (!item) return false;
  if (item.type && item.type.startsWith('image/')) return true;
  return IMAGE_EXT.test(item.name || item.url || '');
}

export function isVideoFile(item: MediaLike): boolean {
  if (!item) return false;
  if (item.type && item.type.startsWith('video/')) return true;
  return VIDEO_EXT.test(item.name || item.url || '');
}

export { isPdfFile };
