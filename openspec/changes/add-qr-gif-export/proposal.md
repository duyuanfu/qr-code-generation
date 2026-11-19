## Why

目前平台只能输出「静态二维码图片」，用户拿到手后还要自己想文案、自己排版，最后做出来的推广图千篇一律。实际投放场景（闲鱼、小红书、朋友圈、电梯屏）真正跑得动的素材是一段 3~5 秒的动图：先吊人 3 秒「等待 3 秒」，再把二维码淡入定格，扫码率比纯静态图高一截。

这类素材现在只能靠外包设计师做，一条几十块、改一次等一天。把这件事搬到平台上，用户上传自己的底图 + 二维码，几分钟就能出一版，是现有「二维码生成」能力的自然延伸——用户要的从来不是一张码，而是能发出去的素材。

## What Changes

- **新增「二维码动图（GIF）导出」页**：上传底图 + 二维码图 → 页面内实时预览动画 → 调时间轴/位置/透明度 → 生成并下载循环 GIF。
- **前端 canvas 实时预览**：拖拽调二维码位置、滑块调大小与透明度、可播放/暂停查看倒计时与淡入效果；预览完全在浏览器本地渲染，不消耗服务端算力，因此**免费且即时**。
- **服务端同步生成**：Java2D 逐帧合成 + ffmpeg 两遍调色板编码，单次请求 6~12 秒返回成品；生成后抽帧用 ZXing 复核可扫性。
- **两级可扫性保障**：轻量预检（单帧 `POST /api/gif/precheck`，约 0.5s，免费）拦掉肉眼看不出的「扫不出来」参数组合；正式生成时再对成品 GIF 抽帧复检，失败自动回退并给出建议值。
- **新增计费项 `gif_export`**：与现有动态活码/静态导出完全一致的「下单 → 支付 → 携带 orderId 核销」单次扣费模式，默认 ¥3/次；生成失败不核销订单。
- **运行时基础镜像调整**：`17-jre-alpine` → `17-jre-jammy`，apt 安装 ffmpeg 与 fontconfig（Alpine 的 musl 与 ffmpeg 生态、AWT 字体栈都不兼容）。
- **订单结果可回溯**：`orders` 表新增 `result_url`，同一笔订单重复请求直接返回同一份 GIF，用户刷新页面也能从订单记录里重新下载。

## Capabilities

### New Capabilities
- `qr-gif-export`: 二维码动图合成、可扫性校验与单次扣费导出能力。

### Modified Capabilities
- `type-based-pricing`: 定价项从「按活码内容类型的托管费 + 静态导出费」扩展为额外的「动图生成费」计费项。

## Impact

- **Affected Code（后端）**：`com.qrstudio.gif/*`（新增渲染引擎）、`GifExportController`、`PricingService`（新增 `ACTION_GIF`）、`SchemaMigrator`（新定价行 + `orders.result_url`）、`Order` 实体、`backend/Dockerfile`、`pom.xml`（`zxing:core`）。
- **Affected Code（前端）**：`app/gif/page.tsx`（新增页）、`components/gif/*`（上传、Canvas 预览、参数面板）、`components/workspace/PaymentModal.tsx`（支持第三个 actionType）、`components/workspace/Header.tsx`（导航入口）。
- **Dependencies**：后端新增 `com.google.zxing:core:3.5.3`（约 500KB，纯 Java 无 native）；系统层新增 `ffmpeg`；中文字体 `NotoSansSC-Bold.otf`（约 8MB，OFL 协议）随 JAR 打包。
- **镜像体积**：后端镜像约 +170MB（jammy 基线 + ffmpeg 及其依赖），属可接受的一次性成本。
- **不涉及**：动态活码扫码链路、落地页、现有定价项价格均不改动。
