import React, { useRef, useState } from 'react';
import { QRContentType, VCardData, MediaItem } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, X, Film, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { authHeaders } from '@/lib/api-client';

/** 与后端 app.upload.max-file-size-mb / spring.servlet.multipart.max-file-size 保持一致 */
const MAX_UPLOAD_MB = 500;

/**
 * 每个类型的文件数量上限。
 * 视频做成「一个活码一条视频」：落地页是全屏播放器，多条只会让用户一直往下滑，
 * 而计费按条累加（¥8/条），一次选 5 条等于一次付 40 元，容易误触。
 * PDF 同理 —— 扫码后的阅读器一次只显示一份。
 */
const MAX_ITEMS: Partial<Record<QRContentType, number>> = {
  video: 1,
  pdf: 1,
};

const ACCEPT_BY_TYPE: Partial<Record<QRContentType, string>> = {
  image: 'image/*',
  video: 'video/*,.mkv,.avi,.mov,.m4v,.webm',
  pdf: '.pdf,application/pdf',
  file:
    '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,' +
    '.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.m4a,.aac,.flac,.ogg',
};

/** 去掉扩展名后的文件名，用作落地页默认标题 */
function baseName(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return (idx > 0 ? filename.slice(0, idx) : filename).trim();
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

interface ContentFormProps {
  type: QRContentType;
  urlValue: string;
  onUrlChange: (v: string) => void;
  textValue: string;
  onTextChange: (v: string) => void;
  vcardData: VCardData;
  onVCardChange: (data: VCardData) => void;

  mediaTitle: string;
  onMediaTitleChange: (v: string) => void;
  mediaDesc: string;
  onMediaDescChange: (v: string) => void;
  mediaList: MediaItem[];
  /**
   * 文件列表变更回调。第二个参数是「本次应当使用的落地页标题」：
   * 用于保证自动填充的标题能立刻被生成活码的请求带上（state 更新是异步的）。
   * 第三个参数说明变更原因：只有 'upload' 才意味着用户想生成新活码，
   * 'remove'（删除某个资源）不应该再次触发付费流程。
   */
  onMediaListChange: (
    items: MediaItem[],
    effectiveTitle?: string,
    reason?: 'upload' | 'remove'
  ) => void;
  onDynamicSave?: () => void;
  isSavingDynamic?: boolean;
  dynamicShortCode?: string;
}

export const ContentForm: React.FC<ContentFormProps> = ({
  type,
  urlValue,
  onUrlChange,
  textValue,
  onTextChange,
  vcardData,
  onVCardChange,
  mediaTitle,
  onMediaTitleChange,
  mediaDesc,
  onMediaDescChange,
  mediaList,
  onMediaListChange,
  onDynamicSave,
  isSavingDynamic,
  dynamicShortCode,
}) => {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 上一次自动填充的标题：只有「标题还是自动值」时才允许被新文件名覆盖，不抢用户手写的标题 */
  const autoTitleRef = useRef<string>('');

  /** 用上传文件名推导落地页标题；返回本次实际生效的标题 */
  const applyAutoTitle = (files: File[]): string => {
    const first = files.length > 0 ? baseName(files[0].name) : '';
    if (!first) return mediaTitle;

    const suggested =
      files.length > 1 ? `${first} 等 ${files.length} 个文件` : first;
    const current = mediaTitle.trim();

    if (current === '' || current === autoTitleRef.current) {
      autoTitleRef.current = suggested;
      onMediaTitleChange(suggested);
      return suggested;
    }
    return current;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    setUploadError(null);

    // 前置体检：超限文件在浏览器端就拦下来，避免白传几百 MB 再被服务端拒绝
    const oversize = selected.find((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (oversize) {
      setUploadError(
        `「${oversize.name}」有 ${formatMB(oversize.size)}，超过单个文件 ${MAX_UPLOAD_MB}MB 上限。请先压缩或裁剪后再上传。`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const empty = selected.find((f) => f.size === 0);
    if (empty) {
      setUploadError(`「${empty.name}」是空文件，无法上传。`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 数量上限：视频/PDF 只允许 1 个，且已存在时不允许再追加
    const limit = MAX_ITEMS[type];
    if (limit && mediaList.length + selected.length > limit) {
      setUploadError(
        limit === 1
          ? `${type === 'video' ? '视频' : 'PDF'}每次只能上传 1 个，请先删除已有的文件再重新选择。`
          : `最多只能上传 ${limit} 个文件。`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadProgress(20);
    setUploadingName(selected.length > 1 ? `${selected.length} 个文件` : selected[0].name);

    try {
      const formData = new FormData();
      selected.forEach((file) => {
        formData.append('files', file);
      });

      setUploadProgress(50);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      // 413 / 5xx 可能是空响应体，先安全解析再给提示
      const data = await res.json().catch(() => null);
      setUploadProgress(100);

      if (data?.success && data.files) {
        const effectiveTitle = applyAutoTitle(selected);
        onMediaListChange([...mediaList, ...data.files], effectiveTitle, 'upload');
      } else if (res.status === 401) {
        setUploadError('上传前请先登录账号。');
      } else if (res.status === 413) {
        setUploadError(
          data?.error || data?.message || `文件超过 ${MAX_UPLOAD_MB}MB 上限，请压缩后重试。`
        );
      } else if (res.status === 429) {
        setUploadError(data?.message || '上传过于频繁，请稍等一分钟再试。');
      } else {
        setUploadError(data?.error || data?.message || `上传失败（HTTP ${res.status}）`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      // 走到这里说明请求根本没拿到响应（断网 / 服务重启 / 连接被重置）
      setUploadError(
        '上传请求中断：请检查网络连接、确认后端服务正常运行后重试；大文件请优先使用有线网络或压缩后再传。'
      );
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
        setUploadingName(null);
      }, 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMediaItem = (id: string) => {
    onMediaListChange(mediaList.filter((item) => item.id !== id), undefined, 'remove');
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      {/* 1. URL */}
      {type === 'url' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="url-input" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            目标网址链接
          </Label>
          <div className="relative">
            <Input
              id="url-input"
              type="url"
              placeholder="https://example.com"
              value={urlValue}
              onChange={(e) => onUrlChange(e.target.value)}
              className="pr-12 text-sm font-medium"
            />
            {urlValue && (
              <button
                type="button"
                onClick={() => onUrlChange('')}
                aria-label="清空网址"
                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            支持网页、网盘链接、表单问卷、社交主页等任何合法 HTTP/HTTPS 链接。
          </p>
        </div>
      )}

      {/* 2. Plain Text */}
      {type === 'text' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="text-input" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            输入纯文本内容
          </Label>
          <textarea
            id="text-input"
            rows={4}
            value={textValue}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="在此输入需要编码的文字内容，支持中文、英文、表情符号及换行..."
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>支持扫码后直接复制与阅读</span>
            <span>字数: {textValue.length}</span>
          </div>
        </div>
      )}

      {/* 3. vCard */}
      {type === 'vcard' && (
        <div className="flex flex-col gap-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            电子名片信息 (vCard 3.0)
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">姓氏</Label>
              <Input
                placeholder="张"
                value={vcardData.lastName}
                onChange={(e) => onVCardChange({ ...vcardData, lastName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">名字</Label>
              <Input
                placeholder="三"
                value={vcardData.firstName}
                onChange={(e) => onVCardChange({ ...vcardData, firstName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">手机号码</Label>
              <Input
                placeholder="13800000000"
                value={vcardData.phone}
                onChange={(e) => onVCardChange({ ...vcardData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">电子邮箱</Label>
              <Input
                placeholder="user@example.com"
                value={vcardData.email}
                onChange={(e) => onVCardChange({ ...vcardData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">公司 / 组织</Label>
              <Input
                placeholder="科技有限公司"
                value={vcardData.organization}
                onChange={(e) => onVCardChange({ ...vcardData, organization: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">职位 / 头衔</Label>
              <Input
                placeholder="产品总监"
                value={vcardData.title}
                onChange={(e) => onVCardChange({ ...vcardData, title: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">个人或公司官网</Label>
            <Input
              placeholder="https://company.com"
              value={vcardData.website}
              onChange={(e) => onVCardChange({ ...vcardData, website: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* 4. Multimedia (Image, Video, PDF, File) */}
      {['image', 'video', 'pdf', 'file'].includes(type) && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {type === 'image'
                ? '图片画廊'
                : type === 'video'
                ? '视频内容'
                : type === 'pdf'
                ? 'PDF专属文档'
                : '附件文件'}落地页设置
            </Label>
            {dynamicShortCode && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 活码已生成 (/q/{dynamicShortCode})
              </span>
            )}
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">标题 (展示在扫码落地页头部)</Label>
            <Input
              placeholder={
                type === 'image'
                  ? '如：2025年产品图集精选'
                  : type === 'video'
                  ? '如：公司宣传片及产品演示'
                  : type === 'pdf'
                  ? '如：公司简介与产品白皮书.pdf'
                  : '如：项目资料包与规格说明书'
              }
              value={mediaTitle}
              onChange={(e) => onMediaTitleChange(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              留空时会自动使用上传文件的名称；手动填写后不会再被覆盖。
            </p>
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">介绍描述 (可选)</Label>
            <Input
              placeholder={type === 'pdf' ? '简要描述文档核心内容，扫码即览无需下载...' : '简要描述多媒体内容、下载须知或联系电话...'}
              value={mediaDesc}
              onChange={(e) => onMediaDescChange(e.target.value)}
            />
          </div>

          {/* Upload Zone */}
          <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center hover:bg-slate-50 transition-colors">
            <UploadCloud className="h-8 w-8 text-blue-500 mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              点击上传或拖拽{type === 'image' ? '多张图片' : type === 'video' ? '视频文件' : type === 'pdf' ? 'PDF文档' : '文件'}至此处
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {type === 'image'
                ? '支持 JPG / PNG / WebP / GIF / BMP，可多选（¥4 / 张）'
                : type === 'video'
                ? '支持 MP4 / MOV / WebM / MKV，每次仅限 1 条（¥8 / 条）'
                : type === 'pdf'
                ? '仅支持 .pdf，扫码直接进入全屏阅读（¥6 / 份）'
                : 'Word / Excel / PPT / PDF / TXT / MD / ZIP / RAR / 7Z / 音频等常用格式，可多选（¥6 / 个）'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              单个文件最大 {MAX_UPLOAD_MB}MB
              {MAX_ITEMS[type] ? `　·　最多 ${MAX_ITEMS[type]} 个` : ''}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple={!MAX_ITEMS[type] || MAX_ITEMS[type] > 1}
              accept={ACCEPT_BY_TYPE[type] || '*/*'}
              onChange={handleFileUpload}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
              <p className="flex-1 text-xs leading-relaxed text-rose-700">{uploadError}</p>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="relative -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-400 transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-rose-100 hover:text-rose-600"
                aria-label="关闭提示"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Upload progress */}
          {uploadProgress !== null && (
            <div className="flex flex-col gap-1.5">
              {uploadingName && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" aria-hidden="true" />
                  正在上传 {uploadingName}...
                </div>
              )}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Uploaded List */}
          {mediaList.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-600">已添加资源 ({mediaList.length})</span>
              <div className="flex flex-wrap gap-2">
                {mediaList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-700"
                  >
                    {item.type.startsWith('image') ? (
                      <img src={item.url} alt={item.name} className="h-6 w-6 rounded object-cover" />
                    ) : item.type.startsWith('video') ? (
                      <Film className="h-4 w-4 text-purple-500" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500" aria-hidden="true" />
                    )}
                    <span className="max-w-[120px] truncate">{item.name}</span>
                    {/* 图标 14px，但用伪元素把热区撑到 44px —— 手机上按 14px 的叉基本按不中 */}
                    <button
                      type="button"
                      onClick={() => removeMediaItem(item.id)}
                      aria-label={`移除 ${item.name}`}
                      className="relative ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-slate-200 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {onDynamicSave && (
            <button
              onClick={onDynamicSave}
              disabled={isSavingDynamic || mediaList.length === 0}
              className="mt-2 min-h-[44px] w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
            >
              {isSavingDynamic ? '正在生成落地页与活码...' : '保存落地页并生成二维码'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
