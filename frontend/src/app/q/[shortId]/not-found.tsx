import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * 短码不存在 / 已失效时的友好提示页。
 * 由 page.tsx 里的 notFound() 触发，因此响应状态码是真正的 404，
 * 而不是 200 + 一张「未找到」的页面（后者会被搜索引擎与监控当成正常页收录）。
 */
export default function ShortLinkNotFound() {
  return (
    <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-6 text-center">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-slate-200/80 flex flex-col items-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">未找到该二维码内容</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          该二维码可能尚未在电脑端保存生成，或链接已失效。
        </p>
      </div>
    </main>
  );
}
