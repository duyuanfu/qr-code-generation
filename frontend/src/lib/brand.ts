/**
 * 品牌信息：所有扫码落地页都会展示「Evan 二维码」品牌链接。
 * 需要换域名时只改这里（或设置环境变量 NEXT_PUBLIC_BRAND_URL），不用逐页搜索。
 */
export const BRAND = {
  name: 'Evan 二维码',
  url: process.env.NEXT_PUBLIC_BRAND_URL || 'http://qr.trythis.pw/',
  slogan: '扫码即达 · 多媒体活码托管',
};
