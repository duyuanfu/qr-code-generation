## 1. Project Scaffolding and Infrastructure

- [x] 1.1 Initialize Next.js 14+ fullstack React project with TypeScript and Tailwind CSS
- [x] 1.2 Install core dependencies (`qr-code-styling`, `@zxing/library`, `jszip`, `xlsx`, `lucide-react`, `drizzle-orm`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- [x] 1.3 Setup UI design system foundation (Tailwind color palette, Shadcn UI components like Button, Tabs, Slider, Dialog, Dropdown)
- [x] 1.4 Configure database client with Drizzle ORM (supporting SQLite for single container and PostgreSQL for cloud deployment)

## 2. QR Code Generation and Beautification Engine

- [x] 2.1 Implement static content formatters (URL, Plain Text, vCard 3.0 string builder, WiFi network string)
- [x] 2.2 Create core `QRCodeCanvas` component wrapping `qr-code-styling` with reactive state synchronization
- [x] 2.3 Implement dots styling options (square, rounded, dots, classy, extra-rounded) and linear/radial gradient color generator
- [x] 2.4 Implement corner eye controls (cornersSquare shape & color, cornersDot shape & color)
- [x] 2.5 Implement center logo upload, aspect ratio scaling, circular/rounded crop, and white protective margin clearance
- [x] 2.6 Implement decorative frame layers (polaroid card, top/bottom text banner, custom message)
- [x] 2.7 Build curated preset templates (Minimal Business, Social Vibrant, Catering/Store, Asset Label) with one-click application
- [x] 2.8 Implement high-resolution export pipelines (PNG, WebP, vector SVG, and printable label format)

## 3. Main Workspace Layout & Interactive Dual Preview

- [x] 3.1 Build top navigation header with workspace tabs (Single Generation, Batch Generator, Batch Decoder) and branding
- [x] 3.2 Build left configuration panel with content type segmented selector and dynamic input forms
- [x] 3.3 Build left accordion styling panel with tabs for Templates, Dots, Eyes, Colors, Logo, and Frame
- [x] 3.4 Build right sticky preview area with Segmented Control to toggle between "QR Code Preview" and "Mobile Phone Mockup Preview"
- [x] 3.5 Implement export action bar with format selector, resolution slider, download trigger, and clipboard copy

## 4. Batch Operations Workspace

- [x] 4.1 Build batch data ingestion UI supporting Excel (.xlsx), CSV, and multi-line raw text paste
- [x] 4.2 Implement Web Worker concurrency pool to render QR codes in parallel without blocking main thread
- [x] 4.3 Build batch generation preview table showing record index, content, thumbnail, and generation progress
- [x] 4.4 Implement batch packaging with JSZip to download all generated assets in one archive
- [x] 4.5 Build batch decoding upload zone supporting multi-image drag-and-drop, clipboard paste, and folder import
- [x] 4.6 Implement dual-engine decoder (native `BarcodeDetector` with `@zxing/library` fallback)
- [x] 4.7 Build decoding results table with status indicators, quick copy, and CSV/Excel export

## 5. Multimedia Dynamic QR & Mobile Landing Page

- [x] 5.1 Define database schema for dynamic QR codes (id, short_code, content_type, title, description, media_urls, style_config) and scan logs
- [x] 5.2 Implement presigned upload API route (`/api/upload/presign`) for direct S3-compatible client upload
- [x] 5.3 Implement dynamic QR creation API route (`/api/qr/dynamic`) to persist metadata and generate short IDs
- [x] 5.4 Build server-rendered mobile landing page route (`/q/[shortId]`) with responsive viewport layout
- [x] 5.5 Implement media view components for landing page: image gallery lightbox, HTML5 video player, and generic file download card
- [x] 5.6 Implement asynchronous scan analytics logging (timestamp, IP geo-location, user-agent device category)

## 6. Docker Containerization & Deployment Orchestration

- [x] 6.1 Create production multi-stage `Dockerfile` optimizing Next.js standalone output and minimal image size
- [x] 6.2 Create `docker-compose.yml` orchestrating Next.js web application, database, and optional local MinIO storage
- [x] 6.3 Provide environment configuration template (`.env.example`) and deployment guide documentation
