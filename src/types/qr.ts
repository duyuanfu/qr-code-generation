export type QRContentType = 'url' | 'text' | 'vcard' | 'wifi' | 'image' | 'video' | 'file';

export interface VCardData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  organization: string;
  title: string;
  website: string;
  address: string;
}

export interface WiFiData {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface MediaItem {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
}

export type DotType = 'square' | 'rounded' | 'dots' | 'classy' | 'extra-rounded';
export type CornerSquareType = 'square' | 'dot' | 'extra-rounded' | 'out-rounded';
export type CornerDotType = 'square' | 'dot';

export interface GradientConfig {
  type: 'linear' | 'radial';
  rotation: number; // 0 - 360
  colorStops: { offset: number; color: string }[];
}

export interface FrameConfig {
  style: 'none' | 'polaroid' | 'banner-bottom' | 'bubble-top' | 'badge';
  text: string;
  textColor: string;
  backgroundColor: string;
}

export interface QRCodeStyleConfig {
  size: number;
  margin: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  dots: {
    type: DotType;
    colorType: 'single' | 'gradient';
    color: string;
    gradient?: GradientConfig;
  };
  cornersSquare: {
    type: CornerSquareType;
    color: string;
  };
  cornersDot: {
    type: CornerDotType;
    color: string;
  };
  background: {
    color: string;
  };
  logo?: {
    src: string;
    widthRatio: number; // 0.15 - 0.25
    margin: number;
    borderRadius: number; // 0 - 50%
  };
  frame?: FrameConfig;
}

export interface StyleTemplate {
  id: string;
  name: string;
  description: string;
  category: 'business' | 'social' | 'store' | 'industrial';
  previewColor: string;
  config: Partial<QRCodeStyleConfig>;
}
