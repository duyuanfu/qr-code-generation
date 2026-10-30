## Why

目前多媒体二维码在移动端扫码后，图片支持全屏灯箱画廊预览，视频支持在线播放，但对于用户高频上传的 PDF 文件（如会议手册、产品白皮书、产品规格书、菜单说明），用户扫码后只能直接点击下载，无法在手机端无需下载直接在线阅读与翻页预览。为提升用户体验与文档传播效率，亟需增加扫码后移动端 PDF 在线即览与全屏阅读器能力。

## What Changes

- **PDF 在线即时预览组件**：移动端扫码落地页检测到 PDF 文档时，新增【在线预览】入口，支持原位嵌入预览或全屏 PDF 阅读器模式。
- **文件卡片交互升级**：在文件列表卡片中，对于 PDF 类型文件区分展示【在线预览】与【直接下载】双操作按钮。
- **PC 端真机双预览同步**：在制作二维码时的 iPhone 模拟器视图中，同步支持 PDF 文件的预览展示。
- **多端移动端兼容**：适配微信内置浏览器、iOS Safari 与 Android Chrome，利用浏览器原生 PDF 渲染能力或轻量内联视窗，支持手势缩放与翻页。

## Capabilities

### New Capabilities
- `pdf-online-preview`: PDF 文件扫码落地页在线即览、全屏沉浸式阅读器与下载分流能力。

### Modified Capabilities
<!-- 无现有规格破坏性变更 -->

## Impact

- **Affected Code**: `src/app/q/[shortId]/page.tsx`, `src/components/landing/MediaViewer.tsx`, `src/components/workspace/DualPreview.tsx`
- **Dependencies**: 纯原生 Web API / iframe 与 object 标签，零额外沉重外部依赖。
