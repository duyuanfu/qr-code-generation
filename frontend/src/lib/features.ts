/**
 * 功能开关。
 *
 * 集中在一个文件里，是因为同一个开关往往要在两处生效：
 * 页面（要不要渲染 / 是否拦截切换）和导航（tab 上要不要打「内测」标记）。
 * 两处各写一份布尔值，早晚会漏改一处，出现「tab 上写着内测、点进去却能正常用」。
 */
export const FEATURES = {
  /**
   * 批量生成：生产环境暂不开放。
   *
   * 关掉时不会渲染组件，切到该 tab 只弹提示、不切页；
   * 依赖也是 next/dynamic 按需加载，关掉期间不会给首屏增加任何体积。
   */
  batchGenerate: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
