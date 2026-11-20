## Why

平台目前的产出全部是**二维码**：能用手机扫、能指向一个网址、能换色换形状。但有一大类场景它天生覆盖不了——**商品条码**。

零售商品上印的那串数字，本质是一维条形码（EAN-13），扫码枪靠它过收银台。这类用户不是要"做一个能扫的图案"，而是要**一张能贴到商品/货架上的标签**：

- 打出来要能被激光扫码枪读到（手机能扫 ≠ 激光枪能扫，后者对条宽比例、静区、对比度苛刻得多）；
- 尺寸要对得上货架卡位与标签纸（A6 价签、40×25mm 不干胶）；
- 数字要肉眼可读，理货和收银要对得上。

现在这类需求只能去专门的条码软件（如 BarTender、在线条码生成站）解决，那些工具界面停在 2010 年，导出还带水印。而本平台已经有订单/支付/后台/导出这一整套设施，补上"条形码"这一块是成本最低的品类扩张。

同时这是一个**能力互补**而不是替代：二维码装得下网址，条形码装的是 sku。两者在同一个工作台里并存，用户才不用在两个网站之间跳。

## What Changes

- **新增独立工作流 `/barcode`**：选码制 → 填内容 → 选标签尺寸与 DPI → 实时预览 → 导出。**不做批量、不做样式美化**（用户明确要求「能用就行」）。
- **服务端出图**：用后端已有的 `com.google.zxing:core`（上一轮做 GIF 时引入）编码一维码，**不新增任何前端依赖**——前端那份 `@zxing/library` 只有 QR/DataMatrix/Aztec 的 writer，一维码 writer 一个都没有。
- **支持 5 种码制**：EAN-13（默认，零售商品）、EAN-8（小包装）、UPC-A（出口北美）、Code 128（内部 SKU/物流）、Code 39（工业资产）。EAN/UPC 的**校验位自动补全与校验**。
- **物理尺寸按毫米交付**：给定 DPI 与标签宽度，输出 PNG 时以「整数模块像素」为准再反算实际毫米与放大倍率，保证条宽比例不被取整破坏；同时输出 SVG 供印刷。
- **免费预览 = 每模块 1 像素**：预览图足以看清内容对不对、码制选没选错，但分辨率低到**无法拿去打印**，因此无需水印、不牺牲可扫性。
- **交付前解码回验**：出图后用 ZXing 解一次并比对内容，再降采样解一次模拟远距/低质打印，两关都过才核销订单。
- **新增计费项 `barcode_export`**：¥2.00 单次，与静态码导出同价但独立计价（后台可单独调价、单独统计），复用现有订单链路与 `orders.result_url` 幂等。

## Capabilities

### New Capabilities
- `barcode-label`: 一维码编码、物理尺寸换算、打印就绪导出与解码回验能力。

### Modified Capabilities
- `type-based-pricing`: 计费项从「活码托管 + 静态导出 + 动图生成」扩展为额外的「条形码标签导出」计费项。

## Impact

- **Affected Code（后端）**：新增 `com.qrstudio.barcode/*`（编码、尺寸换算、SVG 输出、回验）、`BarcodeController`；`PricingService`（新增 `ACTION_BARCODE`）；`SchemaMigrator`（新定价行，`orders.result_url` 复用上一轮已加的列）。
- **Affected Code（前端）**：`app/barcode/page.tsx`（新增页）、`components/barcode/*`（码制/内容/尺寸面板、像素化预览）、`components/workspace/Header.tsx`（导航入口）、`components/workspace/PaymentModal.tsx`（支持第四个 actionType）。
- **Dependencies**：**零新增**。`com.google.zxing:core:3.5.3` 已在上一次变更中引入，一维码 writer（`Code128Writer` / `EAN13Writer` / `EAN8Writer` / `UPCAWriter` / `Code39Writer`）全部在其内。
- **运行时**：无变更。不依赖 ffmpeg，不依赖新字体（人眼可读数字用 JDK 自带的 `Monospaced` 逻辑字体即可，只画数字与 ASCII）。
- **不涉及**：二维码所有链路、动态活码落地页、GIF 导出、批量生成、现有定价项价格。
