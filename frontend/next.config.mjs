/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  /**
   * pdf.js 自托管在 public/vendor/pdfjs（1.4 MB），必须让浏览器长期缓存。
   * 之前的 CDN 返回 `Cache-Control: no-cache, no-store`，每次扫码都要重下，
   * 首屏白等十几秒。这里锁成 immutable，文件名带版本号，升级时改目录即可。
   */
  async headers() {
    return [
      {
        source: '/vendor/pdfjs/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
