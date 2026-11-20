## 1. Encoding Core

- [x] 1.1 `BarcodeSymbology` enum: `EAN_13` / `EAN_8` / `UPC_A` / `CODE_128` / `CODE_39`，每个携带符号模块数、静区模块数、X 尺寸基准（mm）、放大倍率区间、内容校验规则
- [x] 1.2 `ChecksumUtil`: GS1 mod-10 计算与校验（EAN-13 / EAN-8 / UPC-A 共用同一算法，权重从右往左 3,1 交替）
- [x] 1.3 `BarcodeOptions`: 参数对象 + `normalize()`，含 `symbology` / `content` / `labelWidthMm` / `labelHeightMm` / `dpi` / `showText` / `caption` / `orderId`；**手写 getter/setter**（运行时不走 Lombok）
- [x] 1.4 `BarcodeEncoder`: 包装 `MultiFormatWriter`，`EncodeHintType.MARGIN` 按码制设为 11（EAN/UPC）或 10（Code128/39），返回 `BitMatrix`
      > ⚠️ 实现偏差：`MARGIN` 在 ZXing 的**一维码**里是「两侧合计模块数」，不是每侧。传 `11` 只会得到单侧 5.5 模块，`EAN-13` 总宽变成 95+11≈106 而不是 117。实际传的是 `quietModules * 2`（EAN-13 → 22，EAN-8 → 14，UPC-A → 18，Code128/39 → 20）。
- [x] 1.5 内容规范化：EAN/UPC 只接受纯数字（去掉空格与连字符），Code 128 限可打印 ASCII，Code 39 限 `0-9A-Z-. $/+%`
      > 实现补充：EAN-13 **不强制 69 开头** —— 20~29 是合法的店内码（生鲜称重、自制品），强制 69 会让一半零售用户用不了。只校验 GS1 校验位。
- [x] 1.6 非法内容抛 `BarcodeException(400, ...)`，文案要给出「应该填什么」而不是「你错了」

## 2. Physical Sizing

- [x] 2.1 `BarcodeMetrics` record：`symbology` / `normalizedContent` / `checksumAppended` / `modulePx` / `totalModules` / `xMm` / `magnification` / `widthMm` / `heightMm` / `dpi` / `warnings`
- [x] 2.2 尺寸推导：`availPx = round(labelWidthMm / 25.4 * dpi)` → `modulePx = floor(availPx / totalModules)` → 反算 `xMm` 与 `magnification`。**绝不先渲染再缩放**
- [x] 2.3 区间校验：EAN/UPC 的 `magnification` 必须落在 80%~200%，越界返回 `400` 并给出该 DPI 下的合法标签宽度区间
      > 实现补充：`tooTightMessage()` 先算出该 DPI 下**真正可行的整数模块像素区间**（`ceil(总模块 × 0.8)` ~ `floor(总模块 × 2.0)`），再换算成毫米区间，否则给出的建议值自己也不合法。
- [x] 2.4 非阻断警告：倍率偏离 100% 超过 10%、`modulePx < 2`、条高不足 10mm —— 都进 `metrics.warnings`
- [x] 2.5 条高分配：上下各留 8%，`showText` 时底部预留 18% 给数字，剩余为条高；条高不含信息，可自由压缩
      > 实现偏差：文字区取 **16%**（带 `caption` 时 22%），上下留白仍是 8%。18% 在 20mm 高的标签上会把条高压到 10mm 以下，触发自家警告。
- [x] 2.6 单元测试：`modulePx` 恒为整数、`widthMm` 与 `modulePx × totalModules` 自洽、越界倍率被拒

## 3. Raster & Vector Output

- [x] 3.1 `BarcodeRenderer.toImage(BitMatrix, metrics)`: 输出 `TYPE_INT_RGB`（**无 alpha**），底 `#FFFFFF`、条 `#000000`，按 `modulePx` 整数放大
- [x] 3.2 HRI 数字：`Monospaced` 逻辑字体，条下方居中，字号约条高 18%，超宽时先缩字号再截断
- [x] 3.3 `caption` 可选一行备注，画在数字下方，超出标签宽截断
- [x] 3.4 `BarcodeSvgWriter`: `BitMatrix` → SVG，根节点 `width/height` 用 `mm`、`viewBox` 用模块坐标
- [x] 3.5 SVG 游程合并：连续黑模块合成一个 `<rect>`（一维码所有行相同，只需一组矩形 + guard bar 的高矩形）
- [x] 3.6 预览渲染：`modulePx` 强制为 1，输出 base64 data URL，**不落盘**
      > 实现补充：预览**同时按真实分辨率再渲染一份并跑同样的两档自检**，把 `readable` / `verify` / `reason` 一起返回，前端据此禁用导出按钮。那张自检图不返回给前端。原设计没这一步，是测试暴露「用户付完钱才收到 422」后补的。
- [x] 3.7 单元测试：预览图宽度恒等于 `totalModules`；SVG 的 `<rect>` 数量远小于模块总数

## 4. Verification

- [x] 4.1 `BarcodeVerifier`: `MultiFormatReader` + `TRY_HARDER`，两档解码
- [x] 4.2 native 档：原图直接解，比对内容与格式
- [x] 4.3 degraded 档：缩放 + 模糊后再解（复用 `com.qrstudio.gif.FastBlur` 或写个 3×3 均值，别引新依赖）
      > ⚠️ **实现偏差：缩放比从 50% 改成 70%**（`DEGRADE_SCALE = 0.7`），模糊仍是 3×3 均值。50% 比激光枪苛刻太多：
      > 实测 3px 模块的 `CODE_39 AB-123` 在 0.5~0.65 全挂、0.7 才过；放开到 0.7 才能做到「放过 3px、拦住 2px」。
      > 调参探针留在 `BarcodeDegradeProbeTest`（`@Disabled`）。
- [x] 4.4 两档都过才算通过；任一失败返回 `422` 并点名是哪一档
- [x] 4.5 单元测试：故意把 `modulePx` 压到 1 时应能被 degraded 档拦下
      > 实际用例是 `modulePx=2`（12 字符 Code 128 @ 40mm/300dpi）：native 过、degraded 不过，正好卡在边界上。

## 5. API, Billing & Ops

- [x] 5.1 `PricingService.ACTION_BARCODE = "barcode_export"`
- [x] 5.2 `SchemaMigrator`: 新迁移版本插入定价行（`¥2.00`、`valid_months=0`、`per_item=0`、`sort_order=960`），`INSERT IGNORE` 不覆盖后台改过的价
      > 迁移版本号 `2026-11-barcode-label-v4`；`schema.sql` 的种子 INSERT 也同步补了同一行。
- [x] 5.3 `BarcodeController`: `POST /api/barcode/preview`（匿名、免费、不落盘）
- [x] 5.4 `BarcodeController`: `POST /api/barcode/export`（登录 + `paid` 订单 + `action_type` 匹配 + 归属校验，镜像 `GifExportService.resolveOrder`）
      > 实现补充：付费墙总开关关掉时（`isPaywallActive` 为 false）不发订单也放行，与活码生成一致。
- [x] 5.5 幂等：`order.resultUrl` 非空直接返回已存的 PNG/SVG URL，不重渲染
- [x] 5.6 落盘 `{uploadDir}/barcode/{orderId}.png|.svg`；只有「两份文件都在 + 回验通过」才置 `used` 并写 `result_url`
- [x] 5.7 并发闸门：`Semaphore(4)`（比 GIF 轻得多，编码 + PNG 是毫秒级）
      > `tryAcquire(300ms)` 抢不到返回 429。上限约束来自内存：200×150mm@600dpi 单张 1600 万像素 × 4 ≈ 250MB 堆。
- [x] 5.8 `BarcodeCleanupTask`: 每天清 7 天前的 `barcode/*`
      > cron 落在 **04:31** 而不是 04:30 —— 与 GIF 清理任务错开一分钟，日志交叠时不好排查。

## 6. Frontend

- [x] 6.1 新路由 `app/barcode/page.tsx` + `Header` 导航入口（桌面与移动两处）
- [x] 6.2 `types/barcode.ts`: `BarcodeSymbology` / `BarcodeParams` / `BarcodeMetrics` / `DEFAULT_BARCODE_PARAMS`，以及各码制的位数与字符集提示
- [x] 6.3 `lib/barcode-format.ts`: 前端预校验（位数、字符集、校验位），与服务端同规则，错误提示即时显示
- [x] 6.4 `BarcodeForm`: 码制选择 + 内容输入（按码制切换 placeholder 与位数计数）+ 标签尺寸预设（30×20 / 40×25 / 50×30 / 60×40 mm）+ 自定义 + DPI 选择 + `showText` 开关 + `caption`
      > 实现偏差：码制用**五宫格按钮**（每个带一行场景副标题）而不是下拉 —— 用户不知道「EAN-13 和 Code 128 有什么区别」，
      > 藏在下拉里只剩两个陌生词；铺开成卡片能带上「零售商品 / 物流仓储」这类提示。
- [x] 6.5 `BarcodePreview`: `<img>` + `image-rendering: pixelated` 放大显示，下方一行显示「实际 39.6 × 25.0 mm / 放大 102.6% / 每模块 4px」
- [x] 6.6 预览自动刷新：内容或参数变化后 debounce 400ms 调 `/api/barcode/preview`，快速连改时不堆积请求
      > 加 `seqRef` 请求序号：先发的慢请求后到时直接丢弃，否则预览会被刷回旧内容。
- [x] 6.7 `BarcodeWorkbench`: 串联表单 → 预览 → 导出；402 → `PaymentModal`（`actionType='barcode_export'`）→ 支付后重试导出
- [x] 6.8 结果卡：PNG / SVG 两个下载按钮 + 实际尺寸 + 警告列表（如倍率偏大、模块过小）
- [x] 6.9 `PaymentModal`: `actionType` union 增加 `'barcode_export'`，补标题/描述/价格文案
      > 同时把「文件类产物」判断从 `actionType === 'gif_export'` 硬编码抽成 `FILE_PRODUCTS` 集合（`gif_export` + `barcode_export`），后续再加同类产物只改这里。
- [x] 6.10 页面固定提示：「条形码不支持换色与叠图，会影响扫码枪识别」与「请按 100% 原大打印」
      > 落成「打印前请确认三件事」卡片，第三条补了贴纸底色（牛皮纸/彩底对比度不够）。

## 7. Testing & Acceptance

- [x] 7.1 单元测试：`ChecksumUtil` 已知向量（`690123456789` → `2`；`6901234567892` 校验通过；错位一位必须被拒）—— `ChecksumUtilTest` 4 例
- [x] 7.2 单元测试：五种码制各自编码 → 解码，内容与格式往返一致 —— `BarcodeRenderTest#allFiveSymbologiesRoundTrip`（内容用 `SKU01`，避开「模块太细」这个正交问题）
- [x] 7.3 集成测试：EAN-13 / 40mm / 300dpi → `modulePx=4`、`xMm≈0.339`、`magnification≈1.026`、degraded 档通过 —— `BarcodeMetricsTest` + `BarcodeRenderTest`
- [x] 7.4 集成测试：标签宽 20mm / 300dpi → `modulePx` 过小，返回 `400` 并给出合法区间 —— `BarcodeMetricsTest#tooNarrowLabelIsRejectedWithAFeasibleWidthRange`（断言文案里带 `39.6` / `79.1`）
- [x] 7.5 集成测试：同一 `orderId` 重复导出返回同一 URL，不重复扣费 —— `BarcodeExportServiceTest#secondRequestWithTheSameOrderReturnsTheStoredFiles`（Mockito，断言 `cached=true` 且不重渲、不再 `update` 订单）
- [x] 7.6 集成测试：回验失败时订单保持 `paid`，返回 `422` —— `BarcodeRenderTest#longCode128OnANarrowLabelIsCaughtByTheDegradedTier` + `BarcodeExportServiceTest`
- [ ] 7.7 人工：300dpi PNG 与实际标签（不干胶）按原大打印，用**激光扫码枪**读一次，确认 1 秒内识别
- [ ] 7.8 人工：同一张标签用手机相机扫一次（双通道都要能读）
- [ ] 7.9 人工：SVG 用浏览器打开与打印预览，确认无缩放、无锯齿

> 后端全量：`mvn test` → **63 run / 0 fail / 3 skipped**（跳过的是 `GifRenderSmokeTest` 素材未落盘、`GifParamProbeTest` 与 `BarcodeDegradeProbeTest` 两个 `@Disabled` 调参探针）。

## 8. Docs

- [x] 8.1 `AGENT.md`: 新增「条形码标签导出」小节，写明**为什么这条链路必须走后端**（前端无 1D writer + 物理尺寸必须整数模块 + 付费墙），与「静态码纯前端」的例外关系 —— 落成 §5.7
- [x] 8.2 `AGENT.md`: §1 业务线增加第三条的兄弟条目、§3 技术栈、§4 目录地图（`com.qrstudio.barcode`、`components/barcode`）、§6 API、§7 数据模型（复用 `result_url`）
      > 连带订正：`gif.FontRegistry` 已上提为 `com.qrstudio.common.BundledFonts`，§3 / §4 / §5.6 三处原文都已改；§1 的「两条业务线」改成「四条」。
- [x] 8.3 `README.md`: 特性列表、价目表加 `¥2 商品条形码标签`、新增用法章节（含"请用 300dpi 打印"的提示）
- [x] 8.4 `openspec` 变更归档前跑 `openspec validate add-barcode-label-export --strict` —— **Change 'add-barcode-label-export' is valid**
      > 本机 PowerShell 执行策略禁 `.ps1`，用 `& E:\Nvm\node_global\openspec.cmd validate …` 跑。
