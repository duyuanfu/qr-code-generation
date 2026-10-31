import { QRCodeStyleConfig } from '@/types/qr';
import { createQrInstance } from '@/lib/qr-instance';

/**
 * 导出二维码。
 *
 * 刻意接收「内容 + 样式」而不是预览画布的实例：预览区在未付费时渲染的是演示码，
 * 直接复用其 canvas 会把演示码导出给已付费用户。这里永远用真实内容离屏重绘。
 */
export async function downloadQRCode(
  value: string,
  config: QRCodeStyleConfig,
  format: 'png' | 'svg' | 'webp' = 'png',
  filename: string = 'qrcode'
) {
  if (!value) return;

  const qrInstance = await createQrInstance(value, config);

  if (format === 'svg') {
    // Vector SVG export directly from instance
    await qrInstance.download({
      name: filename,
      extension: 'svg',
    });
    return;
  }

  // For PNG/WebP with decorative frame support
  const rawBlob: any = await qrInstance.getRawData(format);
  if (!rawBlob) return;
  const blobData = rawBlob instanceof Blob ? rawBlob : new Blob([rawBlob], { type: `image/${format}` });

  if (!config.frame || config.frame.style === 'none') {
    // No frame, download directly
    await qrInstance.download({
      name: filename,
      extension: format,
    });
    return;
  }

  // Composite QR and frame on an offscreen canvas
  const img = new Image();
  const url = URL.createObjectURL(blobData);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  const qrSize = img.width;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const frame = config.frame;

  if (frame.style === 'polaroid') {
    const pad = Math.round(qrSize * 0.08);
    const bottomTextHeight = Math.round(qrSize * 0.16);
    canvas.width = qrSize + pad * 2;
    canvas.height = qrSize + pad * 2 + bottomTextHeight;

    // Background
    ctx.fillStyle = frame.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw QR
    ctx.drawImage(img, pad, pad);

    // Text
    ctx.fillStyle = frame.textColor || '#000000';
    ctx.font = `bold ${Math.round(qrSize * 0.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frame.text, canvas.width / 2, canvas.height - bottomTextHeight / 2);
  } else if (frame.style === 'banner-bottom') {
    const bannerHeight = Math.round(qrSize * 0.14);
    canvas.width = qrSize;
    canvas.height = qrSize + bannerHeight;

    // Draw QR
    ctx.drawImage(img, 0, 0);

    // Draw banner
    ctx.fillStyle = frame.backgroundColor || '#0f172a';
    ctx.fillRect(0, qrSize, canvas.width, bannerHeight);

    // Text
    ctx.fillStyle = frame.textColor || '#ffffff';
    ctx.font = `600 ${Math.round(qrSize * 0.045)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frame.text, canvas.width / 2, qrSize + bannerHeight / 2);
  } else if (frame.style === 'bubble-top' || frame.style === 'badge') {
    const topHeight = Math.round(qrSize * 0.14);
    canvas.width = qrSize;
    canvas.height = qrSize + topHeight;

    // Draw top banner
    ctx.fillStyle = frame.backgroundColor || '#0f172a';
    ctx.fillRect(0, 0, canvas.width, topHeight);

    // Text
    ctx.fillStyle = frame.textColor || '#ffffff';
    ctx.font = `bold ${Math.round(qrSize * 0.045)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frame.text, canvas.width / 2, topHeight / 2);

    // Draw QR
    ctx.drawImage(img, 0, topHeight);
  } else {
    canvas.width = qrSize;
    canvas.height = qrSize;
    ctx.drawImage(img, 0, 0);
  }

  URL.revokeObjectURL(url);

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, `image/${format}`);
}

export async function copyQRCodeToClipboard(
  value: string,
  config: QRCodeStyleConfig
): Promise<boolean> {
  if (!value) return false;
  try {
    const qrInstance = await createQrInstance(value, config);
    const rawBlob: any = await qrInstance.getRawData('png');
    if (!rawBlob) return false;
    const blob = rawBlob instanceof Blob ? rawBlob : new Blob([rawBlob], { type: 'image/png' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}
