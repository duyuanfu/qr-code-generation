## Context

本项目旨在构建一个高颜值、多功能、高性能的二维码生成与管理 Web SaaS 平台。
不同于市面上常见的限制扫码次数、限期失效的二维码平台，本项目兼顾：
1. **纯静态码**：零服务器负载、纯前端离线生成、终身有效、无限次扫码。
2. **多媒体活码**：上传图片、视频、文件，生成短链，移动端扫码进入自适应响应式落地页（支持在线大图预览、视频点播、原文件下载）。
3. **视觉美化**：分层样式系统（码点、码眼、渐变、Logo、海报边框）。
4. **批量处理**：Excel 导入批量生成 + 多图并发解码识别。
5. **容器化打包**：基于 Next.js 全栈架构与 Docker Compose 部署。

## Goals / Non-Goals

**Goals:**
- **极速响应的前端工作台**：左右双栏联动，左侧配置（内容选择、表单输入、样式微调），右侧实时双模式预览（二维码 / 手机落地页模型）。
- **专业级美化引擎**：封装 `qr-code-styling`，支持圆角/流体点阵、独立码眼双色着色、渐变色渲染、中心 Logo 安全边距、海报边框与经典预置模板。
- **批量并发生成与解码**：
  - 批量生成：解析 Excel / CSV 或多行文本，采用 Web Worker 异步队列并发渲染，一键打包 ZIP（PNG/SVG）与 PDF 排版打印。
  - 批量解码：基于浏览器原生 `BarcodeDetector` API 与 `@zxing/library` 降级引擎，实现拖拽多图/剪贴板截图极速识别并导出结果表格。
- **多媒体活码与移动端落地页**：
  - 采用 S3 兼容协议（Cloudflare R2 / MinIO）预签名直传，不占用 Web 应用容器带宽。
  - 移动端扫码落地页采用 Next.js SSR 渲染，包含多图画廊灯箱、原生视频播放器、附件下载按钮与扫码日志埋点。
- **开箱即用的 Docker 部署**：包含生产级多阶段构建 Dockerfile 和 docker-compose.yml。

**Non-Goals:**
- 初期不包含复杂的在线多人协作或团队权限分配，以个人/创作者及通用商业工作台为主。
- 初期暂不强制绑定支付 SDK，但通过数据模型和中间件预留会员权益门槛（单文件大小配额、专属高级模板、去除白标水印）。

## Decisions

### 1. 全栈架构选型：Next.js App Router (React)
- **决定**：使用 Next.js 14+ App Router 作为统一的前后端框架。
- **理由**：
  - 前端具备 React 生态成熟的交互组件库（Tailwind + Radix / Shadcn UI）。
  - 移动端扫码落地页需要极快的首屏加载体验和良好的 OG/社交分享预览，SSR / Edge 渲染最为契合。
  - 单一仓库管理 API Route、前端组件和落地页，配合 Dockerfile 单镜像打包极简。
- **备选方案**：React Vite SPA + Go/NestJS 后端。虽然性能强，但增加了跨端通信和多服务部署运维复杂度，对于 MVP 而言 Next.js 交付效率最高。

### 2. 渲染与美化引擎：qr-code-styling + 自定义海报合成层
- **决定**：核心点阵由 `qr-code-styling` 驱动，外框海报与装饰文字采用 Canvas / SVG 图层合成。
- **理由**：
  - `qr-code-styling` 具备完善的 dotsOptions, cornersSquareOptions, cornersDotOptions, imageOptions 和 gradient 支持，且可同时输出 Canvas 与矢量 SVG。
  - 海报边框（如“微信扫一扫”、“扫码点餐”）作为独立外框图层，动态包裹内部二维码，实现可配置的标牌卡片。

### 3. 多媒体文件直传策略：S3 Presigned URL
- **决定**：文件上传不经过 Node.js 应用服务器中转，而是客户端向 API 申请预签名 URL（Presigned URL），直接 PUT 到 S3 兼容对象存储。
- **理由**：
  - 避免大文件或视频传输打满 Node.js 事件循环与容器内存，实现带宽与计算解耦。
  - 兼容本地自建 MinIO、免费额度丰厚的 Cloudflare R2（0 出口流量费）以及阿里云/腾讯云 OSS。

### 4. 批量解码引擎架构：原生 BarcodeDetector 优先 + ZXing 降级
- **决定**：检测运行环境中是否存在 `window.BarcodeDetector`，若存在则使用 GPU 硬件加速识别；若不支持（如部分旧版 Safari/Firefox）降级到 `@zxing/library` 或 `jsQR`。
- **理由**：原生 API 处理 50 张图片解码通常在数百毫秒内完成，极大降低 CPU 占用并提升批量吞吐效率。

### 5. 数据持久化：Drizzle ORM + SQLite / PostgreSQL
- **决定**：采用 Drizzle ORM，默认配置为 SQLite（便于 Docker 单机一键启动），配置环境变量即可平滑切换为生产级 PostgreSQL。

## Risks / Trade-offs

- **[Risk] 用户上传超大视频导致存储空间被耗尽** → 限制单次上传视频最大 50MB~100MB，文件最大 20MB；客户端在上传前做 MIME 类型与尺寸校验。
- **[Risk] 密集点阵二维码在暗光或特定角度下难以扫码** → 当用户嵌入中心 Logo 或自定义复杂样式时，强制设置容错等级为 'Q' (25%) 或 'H' (30%)，并保留高对比度白底安全区校验。
- **[Risk] 批量生成上千张图片导致浏览器页面崩溃** → 限制单次批处理阈值，采用 Web Worker 异步任务分片调度，避免阻塞主 UI 线程。
