/**
 * 前端预校验。
 *
 * <p>规则与服务端 `BarcodeContent` / `BarcodeOptions` 完全一致，目的是**输入时就能看到问题**，
 * 而不是点了导出才收到 400。这里不追求「比后端更宽松」也不追求「更严格」——
 * 两边不一致时最难受的是用户：前端说没问题，后端说你错了。
 */

import { SYMBOLOGY_META, type BarcodeParams } from '@/types/barcode';

const CODE_39_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/** GS1 mod-10：从最右一位开始，权重 3、1 交替 */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return -1;
    sum += d * weight;
    weight = 4 - weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** EAN/UPC 用户常从 Excel 复制过来，带空格与连字符，直接吃掉 */
export function stripSeparators(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * 返回第一条错误信息；通过校验返回 null。
 *
 * <p>尺寸类问题不在这里拦：那是「画不出来」而不是「填错了」，服务端会给出
 * 可用的毫米区间，前端照抄一份反而容易过期。
 */
export function validateBarcode(params: BarcodeParams): string | null {
  const content = params.content.trim();
  const meta = SYMBOLOGY_META[params.symbology];

  if (!content) {
    return `请填写 ${meta.label} 的内容`;
  }

  if (params.symbology === 'EAN_13' || params.symbology === 'EAN_8' || params.symbology === 'UPC_A') {
    const digits = stripSeparators(content);
    if (!/^\d+$/.test(digits)) {
      return `${meta.label} 只能填数字（可以带空格或连字符）`;
    }
    if (digits.length === meta.dataLength) return null;
    if (digits.length === meta.fullLength) {
      const expected = gs1CheckDigit(digits.slice(0, -1));
      if (expected !== Number(digits[digits.length - 1])) {
        return `校验位不对：按前 ${meta.dataLength} 位计算末位应为 ${expected}，当前是 ${digits[digits.length - 1]}`;
      }
      return null;
    }
    return `${meta.label} 需要 ${meta.dataLength} 位数字（校验位自动生成）或 ${meta.fullLength} 位完整码，当前 ${digits.length} 位`;
  }

  if (params.symbology === 'CODE_128') {
    if (content.length > 48) return 'Code 128 最多 48 个字符';
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code < 32 || code > 126) {
        return 'Code 128 只支持英文、数字与常用符号，不支持中文';
      }
    }
    return null;
  }

  // CODE_39
  const upper = content.toUpperCase();
  if (upper.length > 43) return 'Code 39 最多 43 个字符';
  for (const ch of upper) {
    if (!CODE_39_CHARSET.includes(ch)) {
      return `Code 39 不支持「${ch}」，可用：0-9、A-Z 与 - . 空格 $ / + %`;
    }
  }
  return null;
}

/** 输入框下方的计数提示，例如「已填 12 / 12 位」 */
export function lengthHint(params: BarcodeParams): string {
  const meta = SYMBOLOGY_META[params.symbology];
  if (params.symbology === 'CODE_128' || params.symbology === 'CODE_39') {
    const max = params.symbology === 'CODE_128' ? 48 : 43;
    return `${params.content.trim().length} / ${max} 字符`;
  }
  const digits = stripSeparators(params.content).length;
  return `${digits} / ${meta.dataLength} 位（或 ${meta.fullLength} 位完整码）`;
}
