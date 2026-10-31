'use client';

import React, { useEffect, useState } from 'react';
import { QRCodeStyleConfig, QRContentType, MediaItem } from '@/types/qr';
import { QRCodeCanvas } from '@/components/qr/QRCodeCanvas';
import { downloadQRCode, copyQRCodeToClipboard } from '@/lib/qr-export';
import { QrCode, Smartphone, Download, Copy, Check, Printer, FileText, Film, Image as ImageIcon, Eye, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPdfFile } from '@/lib/pdf-helpers';
import { PdfViewerModal } from '@/components/landing/PdfViewerModal';
import { PaymentModal } from '@/components/workspace/PaymentModal';
import { useAuth } from '@/components/auth/AuthContext';

interface DualPreviewProps {
  /** 真实内容：仅在解锁后渲染，导出永远用它 */
  value: string;
  /** 未解锁时展示的演示内容：截图拿到的是一张废码 */
  previewValue: string;
  config: QRCodeStyleConfig;
  contentType: QRContentType;
  mediaTitle: string;
  mediaDesc: string;
  mediaList: MediaItem[];
  /** 是否允许预览区显示真实二维码 */
  previewUnlocked: boolean;
  /** 是否已获得导出/打印权限（已付费或管理员） */
  exportUnlocked: boolean;
  /** 支付成功后通知父组件：当前内容已付费 */
  onExportUnlocked: () => void;
}

export const DualPreview: React.FC<DualPreviewProps> = ({
  value,
  previewValue,
  config,
  contentType,
  mediaTitle,
  mediaDesc,
  mediaList,
  previewUnlocked,
  exportUnlocked,
  onExportUnlocked,
}) => {
  const { user, openAuthModal } = useAuth();
  const [viewMode, setViewMode] = useState<'qr' | 'mobile'>('qr');
  const [exportFormat, setExportFormat] = useState<'png' | 'svg' | 'webp'>('png');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewPdfItem, setPreviewPdfItem] = useState<MediaItem | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'download' | 'copy' | 'print' | null>(null);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const isDynamic = ['image', 'video', 'file'].includes(contentType);

  // 内容一改就是一张新的码，需要重新付费，这里同步收回预览放行
  useEffect(() => {
    setJustUnlocked(false);
  }, [value]);

  // 父组件的状态更新是异步的，付费成功先本地放行，避免刚付完钱还看到演示码
  const showReal = previewUnlocked || justUnlocked;
  const displayValue = showReal ? value : previewValue;

  const executeDownload = async () => {
    setDownloading(true);
    try {
      // 始终用真实内容离屏重绘，不复用预览画布
      await downloadQRCode(value, config, exportFormat, 'qr-code');
    } finally {
      setDownloading(false);
    }
  };

  const executeCopy = async () => {
    const success = await copyQRCodeToClipboard(value, config);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const requestExport = (action: 'download' | 'copy' | 'print') => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (exportUnlocked) {
      if (action === 'download') executeDownload();
      else if (action === 'copy') executeCopy();
      else window.print();
      return;
    }
    setPendingAction(action);
    setIsPayModalOpen(true);
  };

  const handleDownload = () => requestExport('download');
  const handleCopy = () => requestExport('copy');
  const handlePrint = () => requestExport('print');

  const handlePaymentSuccess = () => {
    const action = pendingAction;
    setPendingAction(null);
    setJustUnlocked(true);
    onExportUnlocked();

    if (action === 'download') {
      executeDownload();
    } else if (action === 'copy') {
      executeCopy();
    } else if (action === 'print') {
      // 等真实二维码重绘完成再唤起打印，否则打印出来的还是演示码
      setTimeout(() => window.print(), 250);
    }
  };

  return (
    <div className="flex flex-col gap-4 sticky top-20">
      {/* Top Segmented View Switch */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
        <div className="flex rounded-xl bg-slate-100 p-1 w-full">
          <button
            onClick={() => setViewMode('qr')}
            className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
              viewMode === 'qr'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            二维码高清视图
          </button>

          <button
            onClick={() => setViewMode('mobile')}
            className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
              viewMode === 'mobile'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            手机落地页效果
            {isDynamic && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-100/60 p-4 shadow-sm sm:min-h-[420px] sm:p-6">
        {viewMode === 'qr' ? (
          <div className="flex flex-col items-center justify-center py-4">
            <QRCodeCanvas
              value={displayValue}
              config={config}
            />

            {!showReal && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                当前为演示码，扫码无效 · 解锁后显示真实二维码
              </div>
            )}
          </div>
        ) : (
          /* Mobile Phone Mockup */
          <div className="relative mx-auto h-[440px] w-[240px] overflow-hidden rounded-[32px] border-[6px] border-slate-800 bg-white shadow-2xl sm:h-[480px] sm:w-[260px] sm:rounded-[36px] sm:border-[7px]">
            {/* Phone Notch */}
            <div className="absolute top-0 left-1/2 h-4 w-24 -translate-x-1/2 rounded-b-xl bg-slate-800 z-20 flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-900 mr-2" />
              <div className="h-1 w-8 rounded-full bg-slate-700" />
            </div>

            {/* Phone Screen Content */}
            <div className="h-full overflow-y-auto px-4 pt-7 pb-6 flex flex-col text-slate-800 text-xs">
              <div className="border-b border-slate-100 pb-3 text-center">
                <h4 className="font-bold text-sm text-slate-900">{mediaTitle || '欢迎扫码访问'}</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">{mediaDesc || '扫码即览精彩内容'}</p>
              </div>

              {/* Dynamic Content Preview */}
              <div className="mt-4 flex flex-col gap-3">
                {contentType === 'image' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {mediaList.length > 0 ? (
                      mediaList.map((m) => (
                        <img
                          key={m.id}
                          src={m.url}
                          alt={m.name}
                          className="h-24 w-full rounded-lg object-cover shadow-sm"
                        />
                      ))
                    ) : (
                      <div className="col-span-2 flex h-28 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-dashed border-slate-200">
                        <ImageIcon className="h-6 w-6 mb-1 text-slate-300" aria-hidden="true" />
                        <span>暂无图片资源</span>
                      </div>
                    )}
                  </div>
                )}

                {contentType === 'video' && (
                  <div className="flex flex-col gap-2">
                    {mediaList.length > 0 ? (
                      <video
                        src={mediaList[0].url}
                        controls
                        className="w-full rounded-xl shadow-sm bg-black max-h-36 object-contain"
                      />
                    ) : (
                      <div className="flex h-28 flex-col items-center justify-center rounded-xl bg-slate-900 text-white">
                        <Film className="h-6 w-6 mb-1 text-purple-400" aria-hidden="true" />
                        <span className="text-[10px]">视频播放器预览</span>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Dedicated Reader Preview */}
                {contentType === 'pdf' && (
                  <div className="flex flex-col h-[380px] -mx-4 -mt-2 -mb-6 bg-slate-900 rounded-b-2xl overflow-hidden">
                    {mediaList.length > 0 ? (
                      <iframe
                        src={`${mediaList[0].url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                        className="w-full h-full border-none bg-white"
                        title={mediaList[0].name}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-slate-400 bg-slate-900 text-center">
                        <FileText className="h-10 w-10 mb-2 text-red-400" aria-hidden="true" />
                        <span className="text-xs font-semibold text-white">请在左侧上传 PDF 文档</span>
                        <span className="text-[10px] text-slate-400 mt-1">手机扫码将 100% 满屏全宽呈现该文档</span>
                      </div>
                    )}
                  </div>
                )}

                {contentType === 'file' && (
                  <div className="flex flex-col gap-2">
                    {mediaList.length > 0 ? (
                      mediaList.map((m) => {
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                          >
                            <div className="flex items-center gap-2 overflow-hidden pr-1">
                              <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-blue-100 text-blue-600">
                                <FileArchive className="h-4 w-4" aria-hidden="true" />
                              </div>
                              <div className="truncate">
                                <p className="font-semibold truncate text-[11px]">{m.name}</p>
                                <p className="text-[9px] text-slate-400">
                                  {m.size ? `${(m.size / 1024 / 1024).toFixed(1)} MB` : '文档'}
                                </p>
                              </div>
                            </div>
                            <a
                              href={m.url}
                              download={m.name}
                              className="rounded px-2.5 py-1 text-[10px] bg-blue-600 text-white hover:bg-blue-700"
                            >
                              下载
                            </a>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex h-24 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-dashed border-slate-200">
                        <FileArchive className="h-6 w-6 mb-1 text-slate-300" aria-hidden="true" />
                        <span>暂无附件文件</span>
                      </div>
                    )}
                  </div>
                )}

                {!isDynamic && (
                  <div className="flex flex-col items-center justify-center p-4 text-center rounded-xl bg-blue-50/60 text-blue-900">
                    <p className="font-medium text-xs mb-1">静态内容直接识读</p>
                    <p className="text-[10px] text-blue-600/80 break-all">{value || 'https://example.com'}</p>
                  </div>
                )}
              </div>

              {/* Mock footer */}
              <div className="mt-auto pt-6 text-center text-[9px] text-slate-300">
                由 QR Studio 强力驱动 · 安全可信
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export Controls Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold text-slate-700">导出格式</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(['png', 'svg', 'webp'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-semibold uppercase transition-all ${
                  exportFormat === fmt ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{downloading ? '导出中...' : `下载 ${exportFormat.toUpperCase()}`}</span>
          </Button>

          <Button
            onClick={handleCopy}
            variant="outline"
            className="w-full gap-1.5 border-slate-200 hover:bg-slate-50"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-600 font-semibold">已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>复制图片</span>
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center justify-center border-t border-slate-100 pt-1">
          <button
            onClick={handlePrint}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>进入排版打印页面</span>
          </button>
        </div>
      </div>

      {/* PDF Preview Modal in Workspace */}
      {previewPdfItem && (
        <PdfViewerModal
          isOpen={!!previewPdfItem}
          onClose={() => setPreviewPdfItem(null)}
          pdfUrl={previewPdfItem.url}
          title={previewPdfItem.name}
        />
      )}

      {/* Payment Interceptor Modal */}
      <PaymentModal
        isOpen={isPayModalOpen}
        onClose={() => {
          setIsPayModalOpen(false);
          setPendingAction(null);
        }}
        actionType="static_export"
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};
