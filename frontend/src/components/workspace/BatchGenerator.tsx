'use client';

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { UploadCloud, FileSpreadsheet, Download, RefreshCw, CheckCircle2, AlertCircle, FileArchive, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QRCodeStyleConfig } from '@/types/qr';
import { DEFAULT_STYLE_CONFIG } from '@/lib/qr-templates';
import { toQRCodeUTF8 } from '@/lib/qr-formatters';
import { useAuth } from '@/components/auth/AuthContext';
import { PaymentModal } from '@/components/workspace/PaymentModal';

interface BatchItem {
  id: string;
  index: number;
  content: string;
  label: string;
  status: 'pending' | 'rendering' | 'done' | 'error';
  qrDataUrl?: string;
}

/** 预览缩略图尺寸：只够核对映射关系，印刷级成品在付费下载时按 600px 重绘 */
const PREVIEW_SIZE = 240;
const EXPORT_SIZE = 600;

function buildBatchOptions(content: string, size: number) {
  return {
    width: size,
    height: size,
    data: toQRCodeUTF8(content),
    margin: 16,
    dotsOptions: { type: 'rounded' as const, color: '#0f172a' },
    cornersSquareOptions: { type: 'extra-rounded' as const, color: '#0f172a' },
    cornersDotOptions: { type: 'dot' as const, color: '#0f172a' },
    backgroundOptions: { color: '#ffffff' },
  };
}

export const BatchGenerator: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState<'excel' | 'text'>('excel');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  /** 未登录/未付费时点了下载，登录成功后接着走支付 */
  const [pendingExport, setPendingExport] = useState(false);

  // Parse Excel / CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        const newItems: BatchItem[] = [];
        // Skip header if first row has text like 'url' or '内容'
        let startIdx = 0;
        if (data.length > 0 && typeof data[0][0] === 'string' && (data[0][0].includes('内容') || data[0][0].toLowerCase().includes('url') || data[0][0].includes('http') === false)) {
          startIdx = 1;
        }

        for (let i = startIdx; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[0]) continue;
          const content = String(row[0]).trim();
          const label = row[1] ? String(row[1]).trim() : `Item-${i}`;
          if (content) {
            newItems.push({
              id: `${Date.now()}-${i}`,
              index: newItems.length + 1,
              content,
              label,
              status: 'pending',
            });
          }
        }

        setItems(newItems);
      } catch (err) {
        alert('文件解析失败，请检查 Excel/CSV 格式是否正确。');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Parse Raw Multiline Text
  const handleParseText = () => {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const newItems: BatchItem[] = lines.map((line, idx) => {
      const parts = line.split(/[,\t]/);
      return {
        id: `${Date.now()}-${idx}`,
        index: idx + 1,
        content: parts[0].trim(),
        label: parts[1] ? parts[1].trim() : `Item-${idx + 1}`,
        status: 'pending',
      };
    });

    setItems(newItems);
  };

  // Generate QR codes concurrently
  const handleStartBatchGeneration = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    const QRCodeStyling = (await import('qr-code-styling')).default;

    const updated = [...items];
    const total = updated.length;

    for (let i = 0; i < total; i++) {
      updated[i].status = 'rendering';
      setItems([...updated]);

      try {
        const qr = new QRCodeStyling(buildBatchOptions(updated[i].content, PREVIEW_SIZE));

        const rawBlob: any = await qr.getRawData('png');
        if (rawBlob) {
          const blob = rawBlob instanceof Blob ? rawBlob : new Blob([rawBlob], { type: 'image/png' });
          updated[i].qrDataUrl = URL.createObjectURL(blob);
          updated[i].status = 'done';
        } else {
          updated[i].status = 'error';
        }
      } catch (err) {
        updated[i].status = 'error';
      }

      const currentProgress = Math.round(((i + 1) / total) * 100);
      setProgress(currentProgress);
      setItems([...updated]);
    }

    setIsProcessing(false);
  };

  // Download all as ZIP（付费后按 600px 重绘，不用预览用的低清图）
  const doDownloadZip = async () => {
    const doneItems = items.filter((item) => item.status === 'done');
    if (doneItems.length === 0) return;

    const QRCodeStyling = (await import('qr-code-styling')).default;
    const zip = new JSZip();
    const folder = zip.folder('qrcodes');

    for (const item of doneItems) {
      const qr = new QRCodeStyling(buildBatchOptions(item.content, EXPORT_SIZE));
      const rawBlob: any = await qr.getRawData('png');
      if (!rawBlob) continue;
      const blob = rawBlob instanceof Blob ? rawBlob : new Blob([rawBlob], { type: 'image/png' });
      const filename = `${String(item.index).padStart(3, '0')}_${item.label.replace(/[\\/:*?"<>|]/g, '_')}.png`;
      folder?.file(filename, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `qrcodes_batch_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadZip = () => {
    if (items.filter((i) => i.status === 'done').length === 0) return;

    if (!user) {
      setPendingExport(true);
      openAuthModal();
      return;
    }
    if (user.role === 'admin') {
      doDownloadZip();
      return;
    }
    setIsPayModalOpen(true);
  };

  // 登录成功后自动续上刚才被打断的下载
  useEffect(() => {
    if (!pendingExport || !user) return;
    setPendingExport(false);
    if (user.role === 'admin') doDownloadZip();
    else setIsPayModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExport, user]);

  const handleDownloadSampleExcel = () => {
    const wsData = [
      ['二维码内容 (URL或文本)', '标签备注名称'],
      ['https://example.com/asset/1001', '服务器 A-01'],
      ['https://example.com/asset/1002', '路由器 B-02'],
      ['https://example.com/asset/1003', '打印机 C-03'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '批量生成模板');
    XLSX.writeFile(wb, 'QR_Studio_批量生成示例模板.xlsx');
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">批量二维码快速生成</h2>
          <p className="text-xs text-slate-500 mt-1">
            支持 Excel 表格导入与多行文本批量解析，采用并发多线程极速渲染，支持一键打包 ZIP 下载。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadSampleExcel} className="gap-1.5 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            下载标准 Excel 示例模板
          </Button>
        </div>
      </div>

      {/* Ingestion Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            <button
              onClick={() => setInputMode('excel')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                inputMode === 'excel' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600'
              }`}
            >
              Excel / CSV 文件
            </button>
            <button
              onClick={() => setInputMode('text')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                inputMode === 'text' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600'
              }`}
            >
              粘贴多行文本
            </button>
          </div>

          {inputMode === 'excel' ? (
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-slate-50 transition-all">
              <UploadCloud className="h-10 w-10 text-blue-500 mb-2" aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-700">点击上传 Excel/CSV</span>
              <span className="text-xs text-slate-400 mt-1">支持 .xlsx, .xls, .csv 格式</span>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="一行一条数据，支持逗号分隔标签：&#10;https://example.com/1, 设备01&#10;https://example.com/2, 设备02"
                className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <Button size="sm" onClick={handleParseText} className="w-full">
                解析并导入数据
              </Button>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>总计条目：{items.length} 条</span>
                <span>已完成：{items.filter((i) => i.status === 'done').length} 条</span>
              </div>

              {isProcessing && (
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              )}

              <Button
                onClick={handleStartBatchGeneration}
                disabled={isProcessing}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{isProcessing ? `正在渲染 (${progress}%)` : '开始批量并发渲染'}</span>
              </Button>

              <Button
                onClick={handleDownloadZip}
                disabled={items.filter((i) => i.status === 'done').length === 0}
                variant="outline"
                className="w-full gap-2 border-slate-200"
              >
                <FileArchive className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                <span>一键打包下载 ZIP</span>
              </Button>
            </div>
          )}
        </div>

        {/* Preview Table */}
        <div className="md:col-span-2 flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="font-semibold text-sm text-slate-800">
              批量生成列表 ({items.length})
            </h3>
            {items.length > 0 && (
              <button
                onClick={() => setItems([])}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                清空数据
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 min-h-[300px] flex-col items-center justify-center text-slate-400 text-xs">
              <FileSpreadsheet className="h-10 w-10 text-slate-200 mb-2" aria-hidden="true" />
              <span>暂无导入数据，请先上传 Excel 表格或粘贴文本</span>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">序号</th>
                    <th className="py-2.5 px-3">标签/说明</th>
                    <th className="py-2.5 px-3">二维码内容</th>
                    <th className="py-2.5 px-3">预览</th>
                    <th className="py-2.5 px-3">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{item.index}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-700 max-w-[120px] truncate">
                        {item.label}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate font-mono">
                        {item.content}
                      </td>
                      <td className="py-2.5 px-3">
                        {item.qrDataUrl ? (
                          <img
                            src={item.qrDataUrl}
                            alt="qr"
                            className="h-9 w-9 rounded border border-slate-200 bg-white object-contain shadow-xs"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-[10px]">
                            等待
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {item.status === 'done' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 已完成
                          </span>
                        )}
                        {item.status === 'rendering' && (
                          <span className="inline-flex items-center gap-1 text-blue-600 font-medium animate-pulse">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> 渲染中
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-slate-400">就绪</span>
                        )}
                        {item.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> 失败
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PaymentModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        actionType="static_export"
        onSuccess={() => {
          setIsPayModalOpen(false);
          doDownloadZip();
        }}
      />
    </div>
  );
};
