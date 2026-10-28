import { StyleTemplate, QRCodeStyleConfig } from '@/types/qr';

export const DEFAULT_STYLE_CONFIG: QRCodeStyleConfig = {
  size: 320,
  margin: 16,
  errorCorrectionLevel: 'Q',
  dots: {
    type: 'rounded',
    colorType: 'single',
    color: '#0f172a',
  },
  cornersSquare: {
    type: 'extra-rounded',
    color: '#0f172a',
  },
  cornersDot: {
    type: 'dot',
    color: '#0f172a',
  },
  background: {
    color: '#ffffff',
  },
  frame: {
    style: 'none',
    text: '扫一扫 了解更多',
    textColor: '#ffffff',
    backgroundColor: '#0f172a',
  },
};

export const PRESET_TEMPLATES: StyleTemplate[] = [
  {
    id: 'default-clean',
    name: '经典极简',
    description: '黑白高对比度，经典圆角，通用适配所有场景',
    category: 'business',
    previewColor: '#0f172a',
    config: {
      dots: {
        type: 'rounded',
        colorType: 'single',
        color: '#0f172a',
      },
      cornersSquare: {
        type: 'extra-rounded',
        color: '#0f172a',
      },
      cornersDot: {
        type: 'dot',
        color: '#0f172a',
      },
      background: {
        color: '#ffffff',
      },
      frame: {
        style: 'none',
        text: '扫一扫 了解更多',
        textColor: '#ffffff',
        backgroundColor: '#0f172a',
      },
    },
  },
  {
    id: 'tech-cyan-gradient',
    name: '科技霓虹',
    description: '深蓝到青绿线性渐变，适合科技创新、互联网大会',
    category: 'business',
    previewColor: '#0284c7',
    config: {
      dots: {
        type: 'classy',
        colorType: 'gradient',
        color: '#0284c7',
        gradient: {
          type: 'linear',
          rotation: 45,
          colorStops: [
            { offset: 0, color: '#0369a1' },
            { offset: 1, color: '#06b6d4' },
          ],
        },
      },
      cornersSquare: {
        type: 'extra-rounded',
        color: '#0369a1',
      },
      cornersDot: {
        type: 'square',
        color: '#0891b2',
      },
      background: {
        color: '#ffffff',
      },
      frame: {
        style: 'banner-bottom',
        text: '扫码接入 智慧物联',
        textColor: '#ffffff',
        backgroundColor: '#0369a1',
      },
    },
  },
  {
    id: 'social-vibrant-purple',
    name: '活力社交',
    description: '紫粉梦幻渐变与全圆角码点，适合小红书、微信名片与社群引流',
    category: 'social',
    previewColor: '#ec4899',
    config: {
      dots: {
        type: 'dots',
        colorType: 'gradient',
        color: '#9333ea',
        gradient: {
          type: 'linear',
          rotation: 60,
          colorStops: [
            { offset: 0, color: '#9333ea' },
            { offset: 1, color: '#ec4899' },
          ],
        },
      },
      cornersSquare: {
        type: 'dot',
        color: '#9333ea',
      },
      cornersDot: {
        type: 'dot',
        color: '#ec4899',
      },
      background: {
        color: '#fff5f7',
      },
      frame: {
        style: 'bubble-top',
        text: '扫一扫 关注我 ✨',
        textColor: '#ffffff',
        backgroundColor: '#9333ea',
      },
    },
  },
  {
    id: 'catering-warm-orange',
    name: '餐饮门店',
    description: '暖橙色系，醒目海报边框，适合扫码点餐与门店优惠券',
    category: 'store',
    previewColor: '#f97316',
    config: {
      dots: {
        type: 'extra-rounded',
        colorType: 'single',
        color: '#ea580c',
      },
      cornersSquare: {
        type: 'extra-rounded',
        color: '#c2410c',
      },
      cornersDot: {
        type: 'dot',
        color: '#ea580c',
      },
      background: {
        color: '#fffbeb',
      },
      frame: {
        style: 'polaroid',
        text: '扫码自助点餐 享优惠',
        textColor: '#ea580c',
        backgroundColor: '#fed7aa',
      },
    },
  },
  {
    id: 'asset-label-industrial',
    name: '资产盘点标签',
    description: '工业标准高对比度黑白，方正码点，适合固定资产与设备标识',
    category: 'industrial',
    previewColor: '#1e293b',
    config: {
      dots: {
        type: 'square',
        colorType: 'single',
        color: '#000000',
      },
      cornersSquare: {
        type: 'square',
        color: '#000000',
      },
      cornersDot: {
        type: 'square',
        color: '#000000',
      },
      background: {
        color: '#ffffff',
      },
      frame: {
        style: 'badge',
        text: '★ 固定资产 严禁挪用 ★',
        textColor: '#ffffff',
        backgroundColor: '#000000',
      },
    },
  },
];
