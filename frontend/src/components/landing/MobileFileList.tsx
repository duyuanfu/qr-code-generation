'use client';

import React from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileType2,
  FileArchive,
  Music,
  FileImage,
  FileVideo,
  File as FileIcon,
} from 'lucide-react';

interface MediaItem {
  id?: string;
  name?: string;
  url: string;
  size?: number;
  type?: string;
}

interface MobileFileListProps {
  items: MediaItem[];
}

function extOf(item: MediaItem): string {
  const name = item.name || item.url || '';
  const clean = name.split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

function humanSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 按扩展名给一个语义化的图标 + 配色，看起来像文件资源管理器 */
function fileVisual(item: MediaItem) {
  const ext = extOf(item);
  const mime = item.type || '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext) || mime.startsWith('image/')) {
    return { Icon: FileImage, color: 'text-emerald-600 bg-emerald-50' };
  }
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mpg', 'mpeg'].includes(ext) || mime.startsWith('video/')) {
    return { Icon: FileVideo, color: 'text-purple-600 bg-purple-50' };
  }
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext) || mime.startsWith('audio/')) {
    return { Icon: Music, color: 'text-pink-600 bg-pink-50' };
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return { Icon: FileSpreadsheet, color: 'text-green-600 bg-green-50' };
  }
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return { Icon: FileType2, color: 'text-orange-600 bg-orange-50' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { Icon: FileArchive, color: 'text-amber-600 bg-amber-50' };
  }
  if (['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext)) {
    return { Icon: FileText, color: 'text-blue-600 bg-blue-50' };
  }
  return { Icon: FileIcon, color: 'text-slate-600 bg-slate-100' };
}

/**
 * 文件落地页：像文件资源管理器一样，一行一个文件。
 *
 * 每行：图标 · 文件名（过长省略中段）· 体积 · 右侧下载按钮。
 * 整行可点，点击即下载 —— 手机上比对准小小的「下载」二字容易得多。
 */
export const MobileFileList: React.FC<MobileFileListProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-400">
        这个二维码里还没有文件
      </div>
    );
  }

  return (
  <div className="w-full bg-white">
    <div className="flex items-center justify-between px-4 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-slate-500">
      <span>文件</span>
      <span>共 {items.length} 个</span>
    </div>

    <ul className="divide-y divide-slate-100 border-t border-slate-100">
      {items.map((item, idx) => {
        const { Icon, color } = fileVisual(item);
        const size = humanSize(item.size);
        const ext = extOf(item).toUpperCase();

        return (
          <li key={item.id || idx}>
            <a
              href={item.url}
              download={item.name || undefined}
              className="flex items-center gap-3 px-4 py-3 active:bg-slate-50"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {item.name || `文件 ${idx + 1}`}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {ext || '文件'}
                  {size ? ` · ${size}` : ''}
                </span>
              </span>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Download className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  </div>
  );
};
