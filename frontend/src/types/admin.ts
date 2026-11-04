/** 管理后台领域模型，字段与 Java 后端实体保持一致 */

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
}

export interface PricingConfig {
  id: string;
  itemKey: string;
  itemName: string;
  price: number;
  enabled: number;
  /** 基础价内含体积（MB），0 表示不按体积计费 */
  includedSizeMb?: number;
  /** 每超出多少 MB 加一档 */
  stepSizeMb?: number;
  /** 每档加价 */
  stepPrice?: number;
  /** 服务有效期（月），0 表示长期 */
  validMonths?: number;
  /** 计价方式：1 = 按件累加（每个文件各收一次基础价），0 = 按总体积合计 */
  perItem?: number;
  sortOrder?: number;
  updatedAt?: string;
}

export interface PaymentConfig {
  id?: string;
  qrImageUrl?: string | null;
  qrType: 'wechat' | 'alipay' | 'all';
  noticeText?: string | null;
  enabled: number;
}

/** 收款渠道二维码（微信 / 支付宝） */
export interface PaymentQrCode {
  id: string;
  channel: 'wechat' | 'alipay' | string;
  channelName: string;
  imageUrl?: string | null;
  enabled: number;
  sortOrder?: number;
}

/** 二维码内容类型的中文名，价格配置与订单列表共用 */
export const CONTENT_TYPE_LABEL: Record<string, string> = {
  url: '文字 / 链接',
  text: '纯文本',
  vcard: '电子名片',
  image: '图片画廊',
  video: '视频播放',
  pdf: 'PDF 文档',
  file: '文件下载（常用格式）',
};

/**
 * 筛选项用的短标签。上面的长名是给人读的完整描述，
 * 塞进下拉框或 chips 会把整行撑开，这里单独给一份 2 字版本。
 */
export const CONTENT_TYPE_SHORT: Record<string, string> = {
  url: '链接',
  text: '文本',
  vcard: '名片',
  image: '图片',
  video: '视频',
  pdf: 'PDF',
  file: '文件',
};

/** 类型筛选的固定展示顺序，跟着产品主次走，不跟数据顺序走 */
export const CONTENT_TYPE_ORDER = ['url', 'image', 'video', 'pdf', 'file', 'text', 'vcard'] as const;

export type OrderStatus = 'pending' | 'pending_review' | 'paid' | 'used' | 'expired';

export interface AdminOrder {
  id: string;
  orderNo: string;
  userId: string;
  userEmail?: string | null;
  actionType: string;
  amount: number;
  status: OrderStatus;
  paymentVoucher?: string | null;
  createdAt?: string;
  paidAt?: string | null;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待支付',
  pending_review: '待审核',
  paid: '已支付',
  used: '已核销',
  expired: '已过期',
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  dynamic_qr: '动态活码',
  static_export: '二维码图片导出',
};

/** 订单的 action_type 可能是细分定价键（dynamic_qr.video），这里统一转成可读文案 */
export function actionTypeLabel(actionType: string): string {
  if (ACTION_TYPE_LABEL[actionType]) return ACTION_TYPE_LABEL[actionType];

  const [base, contentType] = actionType.split('.');
  if (base === 'dynamic_qr' && contentType) {
    return `动态活码 · ${CONTENT_TYPE_LABEL[contentType] || contentType}`;
  }
  return actionType;
}

/* ================= 动态活码服务期 ================= */

export type QrLifecycleStatus = 'permanent' | 'expired' | 'expiring' | 'active';

export interface AdminDynamicQr {
  id: string;
  shortCode: string;
  contentType: string;
  title: string;
  ownerEmail?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  /** 剩余天数：负数=已过期天数，0=今天到期；长期有效为 null */
  daysLeft?: number | null;
  status: QrLifecycleStatus;
  /** 落地页顶部品牌栏是否展示：1 展示，0 隐藏 */
  showBrandHeader: number;
  /** 软删除时间；非空即已进回收站 */
  deletedAt?: string | null;
  deleted?: boolean;
  /** 累计扫码次数 */
  scanCount?: number;
}

export interface ExpiringQrStats {
  /** 在用活码总数（不含回收站） */
  total: number;
  permanent: number;
  expired: number;
  within7: number;
  within30: number;
  /** 回收站条数 */
  deleted?: number;
  /** 已隐藏品牌栏的活码数 */
  hiddenBrand?: number;
}

export interface ExpiringQrResponse {
  items: AdminDynamicQr[];
  stats: ExpiringQrStats;
  serverTime?: string;
}

export const QR_LIFECYCLE_LABEL: Record<QrLifecycleStatus, string> = {
  permanent: '长期有效',
  expired: '已过期',
  expiring: '即将到期',
  active: '服务中',
};

/** 把 daysLeft 翻成人话，避免页面上出现「还有 -3 天」这种表述 */
export function daysLeftText(qr: AdminDynamicQr): string {
  if (qr.status === 'permanent' || qr.daysLeft == null) return '—';
  const d = qr.daysLeft;
  if (d < 0) return `已过期 ${Math.abs(d)} 天`;
  if (d === 0) return '今天到期';
  return `剩 ${d} 天`;
}
