import React, { useState } from 'react';
import { QRContentType, VCardData, WiFiData, MediaItem } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, X, Film, FileText, CheckCircle2 } from 'lucide-react';

interface ContentFormProps {
  type: QRContentType;
  urlValue: string;
  onUrlChange: (v: string) => void;
  textValue: string;
  onTextChange: (v: string) => void;
  vcardData: VCardData;
  onVCardChange: (data: VCardData) => void;
  wifiData: WiFiData;
  onWiFiChange: (data: WiFiData) => void;
  mediaTitle: string;
  onMediaTitleChange: (v: string) => void;
  mediaDesc: string;
  onMediaDescChange: (v: string) => void;
  mediaList: MediaItem[];
  onMediaListChange: (items: MediaItem[]) => void;
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
  wifiData,
  onWiFiChange,
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadProgress(20);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      setUploadProgress(50);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setUploadProgress(100);

      if (data.success && data.files) {
        onMediaListChange([...mediaList, ...data.files]);
      } else {
        alert(data.error || '上传失败');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('上传请求失败，请重试');
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
      }, 500);
    }
  };

  const removeMediaItem = (id: string) => {
    onMediaListChange(mediaList.filter((item) => item.id !== id));
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
                onClick={() => onUrlChange('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
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

      {/* 4. WiFi */}
      {type === 'wifi' && (
        <div className="flex flex-col gap-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            WiFi 热点连接码
          </Label>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">网络名称 (SSID)</Label>
            <Input
              placeholder="如：Office-Guest-5G"
              value={wifiData.ssid}
              onChange={(e) => onWiFiChange({ ...wifiData, ssid: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">WiFi 密码</Label>
            <Input
              type="password"
              placeholder="若无密码可留空"
              value={wifiData.password}
              onChange={(e) => onWiFiChange({ ...wifiData, password: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="wifi-enc"
                checked={wifiData.encryption === 'WPA'}
                onChange={() => onWiFiChange({ ...wifiData, encryption: 'WPA' })}
              />
              <span>WPA / WPA2 (推荐)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="wifi-enc"
                checked={wifiData.encryption === 'nopass'}
                onChange={() => onWiFiChange({ ...wifiData, encryption: 'nopass' })}
              />
              <span>无加密</span>
            </label>
          </div>
        </div>
      )}

      {/* 5. Multimedia (Image, Video, File) */}
      {['image', 'video', 'file'].includes(type) && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {type === 'image' ? '图片画廊' : type === 'video' ? '视频内容' : '附件文件'}落地页设置
            </Label>
            {dynamicShortCode && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> 活码已生成 (/q/{dynamicShortCode})
              </span>
            )}
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">标题 (展示在扫码落地页头部)</Label>
            <Input
              placeholder={type === 'image' ? '如：2025年产品图集精选' : type === 'video' ? '如：公司宣传片及产品演示' : '如：项目白皮书与规格说明书'}
              value={mediaTitle}
              onChange={(e) => onMediaTitleChange(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">介绍描述 (可选)</Label>
            <Input
              placeholder="简要描述多媒体内容、下载须知或联系电话..."
              value={mediaDesc}
              onChange={(e) => onMediaDescChange(e.target.value)}
            />
          </div>

          {/* Upload Zone */}
          <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center hover:bg-slate-50 transition-colors">
            <UploadCloud className="h-8 w-8 text-blue-500 mb-2" />
            <p className="text-sm font-medium text-slate-700">
              点击上传或拖拽{type === 'image' ? '多张图片' : type === 'video' ? '视频文件' : '文件'}至此处
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {type === 'image' ? '支持 JPG, PNG, WebP, GIF 多选上传' : type === 'video' ? '支持 MP4, WebM, MOV 流式视频' : '支持 PDF, Word, Excel, ZIP 等各类文档'}
            </p>
            <input
              type="file"
              multiple={type === 'image'}
              accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'}
              onChange={handleFileUpload}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>

          {/* Upload progress */}
          {uploadProgress !== null && (
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
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
                      <Film className="h-4 w-4 text-purple-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="max-w-[120px] truncate">{item.name}</span>
                    <button
                      onClick={() => removeMediaItem(item.id)}
                      className="text-slate-400 hover:text-red-500 ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
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
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
            >
              {isSavingDynamic ? '正在生成落地页与活码...' : '保存落地页并生成二维码'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
