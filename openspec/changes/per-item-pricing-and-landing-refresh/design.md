## 1. 为什么是「按件累加」而不是「按总体积打折」

一开始的模型是「一个活码 = 一份服务」，把 N 个文件合起来算体积。听起来合理，但成本项对不上：

- **存储**按文件数 × 体积算，3 张图 × 5MB 和 1 张 15MB 图，占用一样但前者是 3 份运维对象；
- **带宽**是每份文件被单独请求，多图落地页尤其明显；
- **用户预期**是「我传了 3 张，就是买了 3 张的服务」。

所以引入 `per_item` 开关，而不是把规则写死：

```
per_item = 1 → 金额 = Σ(每件基础价 + 该件超体积加价)
per_item = 0 → 金额 = 基础价 + 按合计体积的阶梯加价
```

图片 / PDF / 文件 / 视频置 1；`url` / `text` / `vcard` 没有附件，置 0。

## 2. 为什么体积必须逐文件算

阶梯函数的自变量是「单件体积」，不是「总体积」。3 张 2MB 图：

- 逐件：`3 × tierPrice(2MB) = 3 × 4 = 12` ✅
- 合计：`tierPrice(6MB) = 4` ❌（漏收 2 份）

因此 `MediaSizeResolver` 必须暴露**有序的逐文件数组**（`sizes()`），而不是一个汇总值。`totalBytes()` 保留但改为 `sizes().sum()`，避免两套逻辑漂移。

> 关键约束：下单与核销必须用**同一个数组、同一个顺序**算金额。`OrderController.create` 算出 `¥12` 存库，`DynamicQrController` 再用同一数组算出 `required=¥12` 做 `paid >= required` 比较；只要有一边退化成合计，就会出现「明明付够了却被判超额」。

## 3. 越权校验为什么要在 Controller 而不是 Service

`PricingService` 是纯函数（输入类型 + 体积数组，输出金额），不该知道订单和用户。越权判断依赖「这笔订单属于谁、状态如何、买的是哪个键」，属于编排逻辑，留在 `DynamicQrController.create` 里，按以下顺序短路：

```
1. 参数必填 / 标题非空           → 400
2. contentType 在白名单内          → 400
3. 内容与类型自洽（mediaTypeMismatch） → 400
4. 违禁词合规检查                  → 400
5. 付费墙：订单存在 / 已付 / 归属 / 类型匹配 → 402
6. 付费墙：件数与体积额度           → 402
7. 落库 + 订单置 used
```

第 3 步排在第 5 步之前是刻意的：类型不符是**请求本身有问题**，先告诉调用方「你传错了」，比先抱怨「你没付钱」更有用。

## 4. 落地页版式：类型定版式，文件定可用性

历史教训是「先选视频上传、再切 PDF、扫码打开的是视频」。根因有两层：

1. 前端切 tab 没清理 `mediaList`（已用 `dynamicDraftsRef` 按类型隔离现场修复）；
2. 落地页无条件取 `mediaList[0]` 喂给当前版式，遇到脏数据直接白屏。

所以现在的判定是两段式：

```tsx
const showPdf     = qr.contentType === 'pdf'   && !!pdfItem;
const showGallery = qr.contentType === 'image' && imageItems.length > 0;
const showVideo   = qr.contentType === 'video' && videoItems.length > 0;
// 其余一律走 MobileFileList
```

- **类型决定版式**：用户买的是「文件下载」就给他文件列表，哪怕里面装的全是 PDF —— 这类活码的诉求是「拿回去用」，不是「在线看」。
- **文件决定可用性**：守卫不通过就退化成文件列表。再不济也是「能下载」，而不是白屏。

文件类型判断放在 `lib/media-kind.ts`，扩展名 + MIME 双保险；`isPdfFile` 直接复用 `pdf-helpers`，避免两套 PDF 判定。

## 5. 品牌栏为什么从页脚搬到顶部

页脚在长图 / 全屏 PDF 里永远在「滚到底才能看到」的位置，等于没有。改成 `fixed inset-x-0 top-0 z-40 h-12` 后有两个必须遵守的约定：

- **调用方要给内容加 `pt-12`**，否则首屏被盖住 —— 这一条写进组件注释，别靠记忆；
- **提供 `variant='dark'`**，视频页是纯黑底，白底栏会割裂画面。

用 `<a href>` 而非 `next/link`：落地页是 Server Component，跳去站外/首页不需要客户端路由，原生 `<a>` 更轻且不会因为 Link 预取而多打一次 `/` 的 RSC 请求。

## 6. 微信里的图片必须交给原生预览

多图落地页自己实现灯箱，在微信 X5 里会失去「保存到相册 / 发送给朋友」这两个用户真正想要的动作。所以全屏预览时：

```ts
WeixinJSBridge.invoke('imagePreview', { urls, current });
```

- 非微信环境退回自建 lightbox（左右滑 / 方向键 / Esc）；
- `WeixinJSBridge` 可能尚未注入，监听 `WeixinJSBridgeReady` 后再调，调用失败静默降级。

## 7. 迁移为什么必须是 v2 而不是改 v1

`app_migrations` 用 `INSERT IGNORE` 抢占，v1 在所有环境都已标记为「跑过」。改 v1 的 SQL 对已升级的库**完全无效**，只会让新库和老库行为分叉。所以所有数据变更都进 v2。

另一个坑：`schema.sql` 由 Spring 在上下文启动早期执行，**早于** `SchemaMigrator` 的 `ApplicationRunner`。因此种子 `INSERT` 里绝不能出现迁移才 `ALTER` 上去的列 —— 否则老库升级时直接 `Unknown column 'per_item'` 启动失败。这一条已写成 `schema.sql` 顶部的警告注释。
