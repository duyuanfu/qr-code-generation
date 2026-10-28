'use client';

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ScanLine, UploadCloud, Copy, Check, ExternalLink, AlertCircle, CheckCircle2, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DecodedItem {
  id: string;
  filename: string;
  thumbnail: string;
  status: 'processing' | 'success' | 'failed';
  result?: string;
  format?: string;
}

export const BatchDecoder: React.FC = () => {
  const [items, setItems] = useState<DecodedItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Decode single image with dual engine: BarcodeDetector -> ZXing fallback
  const decodeImage = async (file: File): Promise<{ success: boolean; result?: string; format?: string }> => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    // 1. Try Native BarcodeDetector (Hardware Accelerated)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'data_matrix', 'code_128', 'ean_13'],
        });
        const barcodes = await barcodeDetector.detect(img);
        if (barcodes && barcodes.length > 0) {
          URL.revokeObjectURL(objectUrl);
          return {
            success: true,
            result: barcodes[0].rawValue,
            format: barcodes[0].format,
          };
        }
      } catch (err) {
        // Fallback to ZXing
      }
    }

    // 2. ZXing BrowserMultiFormatReader fallback
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/library');
      const reader = new BrowserMultiFormatReader();
      const res = await reader.decodeFromImageElement(img);
      URL.revokeObjectURL(objectUrl);
      if (res) {
        return {
          success: true,
          result: res.getText(),
          format: res.getBarcodeFormat()?.toString(),
        };
      }
    } catch (zxingErr) {
      // Decode failed
    }

    URL.revokeObjectURL(objectUrl);
    return { success: false };
  };

  // Process multiple images
  const handleProcessFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileList.length === 0) return;

    const newEntries: DecodedItem[] = fileList.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random()}`,
      filename: file.name,
      thumbnail: URL.createObjectURL(file),
      status: 'processing',
    }));

    setItems((prev) => [...prev, ...newEntries]);

    // Decode sequentially or in small parallel batches
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const entryId = newEntries[i].id;

      const decodeResult = await decodeImage(file);

      setItems((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: decodeResult.success ? 'success' : 'failed',
                result: decodeResult.result,
                format: decodeResult.format,
              }
            : item
        )
      );
    }
  };

  // Listen to Global Paste (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        handleProcessFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleCopyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportResults = () => {
    const exportData = items.map((item, idx) => ({
      序号: idx + 1,
      文件名: item.filename,
      识别状态: item.status === 'success' ? '成功' : '失败/未识别',
      解码内容: item.result || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '解码结果');
    XLSX.writeFile(wb, `QR_Decode_Results_${Date.now()}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">批量二维码快速解码识别</h2>
          <p className="text-xs text-slate-500 mt-1">
            支持拖拽多张图片、截图直接 Ctrl+V 粘贴与文件夹导入，结合原生硬件加速与 ZXing 引擎毫秒级识别。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportResults}
              className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-800"
            >
              <Download className="h-3.5 w-3.5" />
              导出解码结果到 Excel
            </Button>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) {
              handleProcessFiles(e.dataTransfer.files);
            }
          }}
          className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-all"
        >
          <UploadCloud className="h-10 w-10 text-blue-500 mb-2 animate-bounce" />
          <p className="text-sm font-semibold text-slate-700">
            拖拽多张二维码图片到此处，或直接在页面任意处按 <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-xs">Ctrl + V</kbd> 粘贴截图
          </p>
          <p className="text-xs text-slate-400 mt-1">
            支持批量选中多图、PNG、JPG、WebP、GIF 等各类常见格式
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => e.target.files && handleProcessFiles(e.target.files)}
            className="hidden"
          />
        </label>
      </div>

      {/* Results Table */}
      {items.length > 0 && (
        <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm text-slate-800">
                识别结果列表 (已添加 {items.length} 张，成功 {items.filter((i) => i.status === 'success').length} 张)
              </h3>
            </div>
            <button
              onClick={() => setItems([])}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空全部
            </button>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">原图</th>
                  <th className="py-2.5 px-3">文件名</th>
                  <th className="py-2.5 px-3">识别状态</th>
                  <th className="py-2.5 px-3">解析内容</th>
                  <th className="py-2.5 px-3 text-right">快捷操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3">
                      <img
                        src={item.thumbnail}
                        alt="thumb"
                        className="h-10 w-10 rounded-lg border border-slate-200 object-cover bg-white shadow-xs"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700 max-w-[150px] truncate">
                      {item.filename}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.status === 'success' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 识别成功
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="inline-flex items-center gap-1 text-blue-600 font-medium animate-pulse">
                          <ScanLine className="h-3.5 w-3.5 animate-spin" /> 正在识别
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                          <AlertCircle className="h-3.5 w-3.5" /> 未识别或无码
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 max-w-[320px] truncate select-all">
                      {item.result || <span className="text-slate-300">--</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.result && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyText(item.id, item.result!)}
                            className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600"
                          >
                            {copiedId === item.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1">{copiedId === item.id ? '已复制' : '复制'}</span>
                          </Button>

                          {item.result.startsWith('http') && (
                            <a
                              href={item.result}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center h-7 px-2 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-600"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
