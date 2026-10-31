import { QRCodeStyleConfig } from '@/types/qr';
import { toQRCodeUTF8 } from '@/lib/qr-formatters';

/**
 * 构建 qr-code-styling 的渲染参数。
 *
 * 预览画布与导出用的离屏实例必须共用这一份配置，否则会出现
 * 「预览和下载出来的图片样式不一致」这种很难排查的问题。
 */
export function buildQrOptions(value: string, config: QRCodeStyleConfig, size?: number) {
  const dimension = size ?? config.size ?? 300;

  const options: any = {
    width: dimension,
    height: dimension,
    type: 'canvas',
    data: toQRCodeUTF8(value || 'https://example.com'),
    margin: config.margin ?? 16,
    qrOptions: {
      typeNumber: config.densityLevel || 0,
      errorCorrectionLevel: config.logo?.src ? 'H' : config.errorCorrectionLevel || 'Q',
    },
    dotsOptions: {
      type: config.dots.type,
      color: config.dots.colorType === 'single' ? config.dots.color : undefined,
      gradient: config.dots.colorType === 'gradient' ? config.dots.gradient : undefined,
    },
    cornersSquareOptions: {
      type: config.cornersSquare.type,
      color: config.cornersSquare.color,
    },
    cornersDotOptions: {
      type: config.cornersDot.type,
      color: config.cornersDot.color,
    },
    backgroundOptions: {
      color: config.background.color,
    },
  };

  if (config.logo?.src) {
    options.image = config.logo.src;
    options.imageOptions = {
      hideBackgroundDots: true,
      imageSize: config.logo.widthRatio || 0.22,
      margin: config.logo.margin ?? 6,
    };
  }

  return options;
}

/**
 * 创建一个不挂载到页面上的离屏渲染实例。
 *
 * 导出走这里而不是复用预览画布的实例，是因为「预览」和「导出」的内容可能不同
 * （未付费时预览是演示码，导出必须是真实码），共用实例会在解锁瞬间拿到旧数据。
 */
export async function createQrInstance(value: string, config: QRCodeStyleConfig, size?: number) {
  const QRCodeStyling = (await import('qr-code-styling')).default;
  return new QRCodeStyling(buildQrOptions(value, config, size));
}
