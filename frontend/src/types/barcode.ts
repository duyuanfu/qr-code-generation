/** 条形码标签导出的请求与响应类型，与后端 BarcodeOptions / BarcodeMetrics 一一对应 */

export type BarcodeSymbology = 'EAN_13' | 'EAN_8' | 'UPC_A' | 'CODE_128' | 'CODE_39';

export interface BarcodeParams {
  symbology: BarcodeSymbology;
  content: string;
  /** 标签宽度（含静区） */
  labelWidthMm: number;
  labelHeightMm: number;
  dpi: number;
  showText: boolean;
  caption: string;
}

export const DEFAULT_BARCODE_PARAMS: BarcodeParams = {
  symbology: 'EAN_13',
  content: '',
  labelWidthMm: 40,
  labelHeightMm: 25,
  dpi: 300,
  showText: true,
  caption: '',
};

export interface BarcodeMetrics {
  symbology: BarcodeSymbology;
  symbologyLabel: string;
  normalizedContent: string;
  checksumAppended: boolean;
  modulePx: number;
  totalModules: number;
  xMm: number;
  magnification: number;
  widthMm: number;
  heightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  dpi: number;
  imageWidth: number;
  imageHeight: number;
  warnings: string[];
}

export interface BarcodePreviewResult {
  dataUrl: string;
  metrics: BarcodeMetrics;
  previewModulePx: number;
  /** 服务端按真实分辨率渲染并解码的结论；false 表示这组参数印出来读不出 */
  readable: boolean;
  verify: Record<string, boolean>;
  reason?: string;
}

export interface BarcodeExportResult {
  pngUrl: string;
  svgUrl: string;
  metrics?: BarcodeMetrics;
  verify?: Record<string, boolean>;
  cached?: boolean;
}

/** 各码制的内容要求；与后端 BarcodeContent 的规则保持一致，避免「前端放过、后端拒绝」 */
export const SYMBOLOGY_META: Record<
  BarcodeSymbology,
  {
    label: string;
    scene: string;
    placeholder: string;
    hint: string;
    /** 不含校验位的位数上限；0 表示长度可变 */
    dataLength: number;
    fullLength: number;
  }
> = {
  EAN_13: {
    label: 'EAN-13',
    scene: '零售商品',
    placeholder: '690123456789',
    hint: '12 位数字（第 13 位校验位自动生成）。商品码通常以 69 开头，店内码 20~29 也支持。',
    dataLength: 12,
    fullLength: 13,
  },
  EAN_8: {
    label: 'EAN-8',
    scene: '小包装',
    placeholder: '6901234',
    hint: '7 位数字（第 8 位校验位自动生成）。用于口香糖、笔芯这类印不下 EAN-13 的小包装。',
    dataLength: 7,
    fullLength: 8,
  },
  UPC_A: {
    label: 'UPC-A',
    scene: '出口北美',
    placeholder: '01234567890',
    hint: '11 位数字（第 12 位校验位自动生成）。北美零售通行的码制，国内商品一般不需要。',
    dataLength: 11,
    fullLength: 12,
  },
  CODE_128: {
    label: 'Code 128',
    scene: '内部编号 / 快递单',
    placeholder: 'SKU-2026-0001',
    hint: '1~48 个英文、数字或常用符号；纯数字会自动用更短的编码方式。中文请改用二维码。',
    dataLength: 0,
    fullLength: 0,
  },
  CODE_39: {
    label: 'Code 39',
    scene: '工业资产牌 / 旧系统',
    placeholder: 'AB-123',
    hint: '1~43 个 0-9、A-Z 与 - . 空格 $ / + %；小写会自动转成大写。',
    dataLength: 0,
    fullLength: 0,
  },
};

export const LABEL_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: '30 × 20', width: 30, height: 20 },
  { label: '40 × 25', width: 40, height: 25 },
  { label: '50 × 30', width: 50, height: 30 },
  { label: '60 × 40', width: 60, height: 40 },
];

export const DPI_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: 203, label: '203 dpi', hint: '热敏标签机' },
  { value: 300, label: '300 dpi', hint: '激光 / 喷墨（推荐）' },
  { value: 600, label: '600 dpi', hint: '精细打印' },
];
