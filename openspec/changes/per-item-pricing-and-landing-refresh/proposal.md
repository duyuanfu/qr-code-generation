## Why

付费墙上线后，用户真正的使用姿势暴露了几个拍脑袋设计留下的坑：

1. **多文件只收一份钱** —— 一个活码能挂 N 张图 / N 个附件，但计价按「总体积合计一份」算。3 张图 = ¥4，等于托管成本翻了 3 倍而收入没变，越用越亏。
2. **支付弹窗只显示 1 张图的费用** —— 与第 1 条同源，前端也只按单件算。
3. **扫码后图片上下紧挨、没有下载按钮** —— 多图活码的落地页把 `mediaList[0]` 当唯一内容渲染，其余图片既看不到也存不下来。
4. **视频不能下载** —— 客户要拿回去二次剪辑，只能录屏。
5. **WiFi 类型是纯静态码** —— 内容靠前端拼 `WIFI:` 串，不占服务器、无成本，却混在动态活码的类型选择器里，还配了一份价格配置。产品语义混乱。
6. **静态码被提示「服务到期」** —— 静态码内容根本不存服务器，没有托管就没有服务期，提示纯属误导。
7. **落地页没有品牌入口** —— 品牌链接写在页脚，全屏阅读器里几乎看不见；扫码的人不知道这是谁提供的服务，也回不到首页。
8. **「高清二维码批量/单张无水印导出」名不副实** —— 实际卖的是「把真实内容（而不是演示内容）导成 PNG/ZIP」，跟「高清」「无水印」没关系，用户看不懂自己在买什么。
9. **文件类型支持太窄** —— 只有 PDF/Word/Excel/ZIP 那一小撮，日常的 PPT、ODT、Markdown、音频都传不上去；扫码后也不是文件列表，而是强行当成 PDF 渲染。

## What Changes

- **按件累加计价**：`pricing_configs` 新增 `per_item`。图片 / PDF / 文件 / 视频置 1，订单金额 = Σ（每件基础价 + 该件自身的超体积加价）；纯文本类置 0，保持「按总体积一份」。3 张 2MB 图 = 3 × ¥4 = ¥12。
- **服务端逐文件核体积**：`MediaSizeResolver` 拆出 `sizes()` 返回逐文件字节数，`totalBytes()` 改为求和；下单与核销都用同一份逐文件数组，避免「下单 ¥12、核销按 ¥4 算」被体积校验挡下。
- **越权校验升级为「件数 + 体积」**：用单张图的订单塞 3 张图同样返回 402。
- **内容与类型自洽校验**：`DynamicQrController.mediaTypeMismatch()` —— `pdf` 只能装 `.pdf`，`video` / `image` 只能装对应扩展名，`file` 放行任意附件，不符直接 400。
- **落地页顶部品牌栏**：新增 `LandingHeader`（fixed `h-12`，logo + 站名点回首页，右侧「进入首页」，暗色变体供视频页用），替换原页脚 `BrandFooter`。
- **图片画廊重做**：多图按原始比例纵向连排、上下零间距，每张右下角圆形下载按钮；全屏灯箱支持左右滑动 / 方向键 / Esc，微信内走 `WeixinJSBridge.imagePreview`。
- **视频支持下载**：右上角下载胶囊，保留 X5 `h5-page` 播放属性；每次仅限 1 条。
- **文件列表重做**：`MobileFileList` 一行一个（语义化图标 · 文件名 · `EXT · 体积` · 下载钮），整行可点即下载，带空状态。
- **渲染策略改为「类型定版式，文件定可用性」**：`contentType` 决定用哪种版式，`isPdfFile / isImageFile / isVideoFile` 做守卫；对不上时退化成文件列表，绝不拿 mp4 喂 pdf.js。
- **删除 WiFi 类型**：前端类型选择器 8 → 7，`QRContentType`、`buildWiFiString`、`WiFiData`、后端白名单与价目行一并移除。
- **静态码不再有有效期**：`static_export.valid_months = 0`，支付弹窗显示「永久有效（内容不存服务器）」。
- **导出费改名**：`static_export` → 「二维码图片导出（单张 / 批量 ZIP）」，admin 动作名同步。
- **文件类型白名单大扩充**：新增 PPT/PPTX/ODT/ODS/ODP/RTF/MD/TXT、MP3/WAV/M4A/AAC/FLAC/OGG 等，魔数表同步补齐（OLE2 / fLaC / OggS / ADTS / EBML / `00 00 01 BA` 等）。
- **幂等迁移 V2**：`2026-10-per-item-pricing-v2` 一次性刷 `per_item`、删 wifi 行、把 `static_export` 的服务期归零、对齐所有展示名与提示语。

## Capabilities

### New Capabilities
- `per-item-pricing`：按件累加计价、逐文件体积核算、件数 + 体积双越权校验。
- `landing-shell`：扫码落地页的统一顶部品牌栏与四种内容版式分派。
- `file-library-landing`：常用格式 + 多文件 + 资源管理器式列表 + 逐个下载。

### Modified Capabilities
- `type-based-pricing`：价目表去掉 `dynamic_qr.wifi`，图片 / PDF / 文件 / 视频改为按件计价。
- `brand-attribution`：品牌露出从页脚迁到顶部固定栏。
- `static-export`：不再有服务期，改名并明确售卖物。

## Impact

- 数据库：`pricing_configs.per_item` 新列（`TINYINT NOT NULL DEFAULT 0`）；`dynamic_qr.wifi` 行删除；`static_export.valid_months` 置 0。
- 后端：`PricingService`、`MediaSizeResolver`、`OrderController`、`DynamicQrController`、`FileValidator`、`SchemaMigrator`、`AdminController`。
- 前端：`app/q/[shortId]/page.tsx`、`components/landing/*`、`components/workspace/{ContentTypeSelector,ContentForm,PaymentModal}`、`components/admin/PricingPanel`、`lib/{media-kind,qr-formatters}`、`types/{qr,admin}`、`app/page.tsx`。
- 兼容性：老订单金额维持不变（历史账单不动）；已存在的活码仅版式渲染逻辑变化，数据不改写。
