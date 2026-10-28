## Why

目前市面上的二维码生成与美化工具普遍存在扫码次数限制、有效期截断、文件上传容量苛刻或强制高额订阅等问题。用户在商务名片、多媒体分享、设备物料盘点、活动宣传等场景中，亟需一个集“静态与多媒体活码生成”、“深度视觉美化模板”、“批量生成与批量解码”于一体，且支持私有化 Docker 部署的高性能现代 Web 工具平台。

## What Changes

- **全类型二维码生成**：支持纯文本、网址、vCard 电子名片、WiFi 连接码等离线静态码生成。
- **多媒体活码与移动端落地页**：支持图片画廊、高清视频流、多格式附件文件上传，手机扫码后直接进入优雅的响应式移动端落地页，支持在线预览与高速下载。
- **专业级二维码美化引擎**：提供分层渲染（码点几何造型、码眼内外圈独立着色、线性/径向渐变、中心 Logo 保护边、海报式文字外框），内置高质感行业预置模板。
- **批量作业工作台**：
  - 批量生成：支持 CSV/Excel 导入、多行文本批量解析，Web Worker 并发多线程渲染，一键打包 ZIP 高清导出与排版打印。
  - 批量解码：支持多图拖拽、截图剪贴板粘贴与文件夹导入，基于浏览器原生 BarcodeDetector 与 ZXing 引擎毫秒级识别并导出表格。
- **Docker 容器化与部署**：提供开箱即用的 Docker 与 Docker Compose 部署配置，支持本地存储与 S3 兼容对象存储驱动。

## Capabilities

### New Capabilities
- `qr-generation-and-styling`: 纯前端静态二维码生成与多维度美化渲染引擎（码点、码眼、渐变色、Logo 裁切、外框海报与预置模板）。
- `batch-qr-operations`: 批量二维码生成（Excel/CSV 导入、多线程并发生成、ZIP 打包、标签排版打印）与批量二维码解码识别工作台。
- `media-landing-page`: 图片、视频、文件等多媒体活码托管服务与移动端扫码自适应落地页（大图灯箱、视频点播、文件下载与扫码数据埋点）。
- `docker-deployment`: 基于 Next.js 全栈架构的 Docker 镜像打包与 docker-compose 部署编排配置。

### Modified Capabilities
<!-- 无现有规格变更，本项目为全新初始化项目 -->

## Impact

- **技术栈依赖**：Next.js (React 18/19), Tailwind CSS, Shadcn UI, qr-code-styling, @zxing/library, jszip, lucide-react。
- **存储与数据**：S3 兼容对象存储（Cloudflare R2 / MinIO / 本地存储）和轻量关系数据库（PostgreSQL / SQLite）。
- **运行环境**：Node.js 20+，Docker 容器化环境。
