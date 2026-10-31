import React from 'react';
import { Globe, FileText, Contact2, Image as ImageIcon, Video, FileCheck, FileArchive } from 'lucide-react';
import { QRContentType } from '@/types/qr';

interface ContentTypeSelectorProps {
  currentType: QRContentType;
  onSelectType: (type: QRContentType) => void;
}

const CONTENT_TYPES: { id: QRContentType; label: string; icon: React.ComponentType<{ className?: string }>; isDynamic?: boolean }[] = [
  { id: 'url', label: '网址链接', icon: Globe },
  { id: 'text', label: '纯文本', icon: FileText },
  { id: 'vcard', label: '电子名片', icon: Contact2 },
  { id: 'image', label: '图片画廊', icon: ImageIcon, isDynamic: true },
  { id: 'video', label: '视频播放', icon: Video, isDynamic: true },
  { id: 'pdf', label: 'PDF文档', icon: FileCheck, isDynamic: true },
  { id: 'file', label: '文件下载', icon: FileArchive, isDynamic: true },
];

export const ContentTypeSelector: React.FC<ContentTypeSelectorProps> = ({
  currentType,
  onSelectType,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          选择二维码类型
        </label>
        <span className="text-xs text-slate-500">
          {['image', 'video', 'pdf', 'file'].includes(currentType) ? '活码 (带移动落地页)' : '静态码 (离线永久有效)'}
        </span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {CONTENT_TYPES.map((item) => {
          const Icon = item.icon;
          const isSelected = currentType === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectType(item.id)}
              className={`relative flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 transition-all ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm ring-1 ring-blue-600'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {item.isDynamic && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              )}
              <Icon className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} aria-hidden="true" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
