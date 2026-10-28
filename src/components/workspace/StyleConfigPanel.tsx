import React, { useState } from 'react';
import { QRCodeStyleConfig, DotType, CornerSquareType, CornerDotType } from '@/types/qr';
import { PRESET_TEMPLATES } from '@/lib/qr-templates';
import { Sparkles, CircleDot, Eye, Palette, Image as ImageIcon, Frame } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface StyleConfigPanelProps {
  config: QRCodeStyleConfig;
  onChange: (newConfig: QRCodeStyleConfig) => void;
}

export const StyleConfigPanel: React.FC<StyleConfigPanelProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'dots' | 'eyes' | 'colors' | 'logo' | 'frame'>('templates');

  const updateDots = (updates: Partial<QRCodeStyleConfig['dots']>) => {
    onChange({
      ...config,
      dots: { ...config.dots, ...updates },
    });
  };

  const updateCornersSquare = (updates: Partial<QRCodeStyleConfig['cornersSquare']>) => {
    onChange({
      ...config,
      cornersSquare: { ...config.cornersSquare, ...updates },
    });
  };

  const updateCornersDot = (updates: Partial<QRCodeStyleConfig['cornersDot']>) => {
    onChange({
      ...config,
      cornersDot: { ...config.cornersDot, ...updates },
    });
  };

  const updateFrame = (updates: Partial<NonNullable<QRCodeStyleConfig['frame']>>) => {
    onChange({
      ...config,
      frame: {
        ...(config.frame || {
          style: 'none',
          text: '扫一扫 了解更多',
          textColor: '#ffffff',
          backgroundColor: '#0f172a',
        }),
        ...updates,
      },
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      onChange({
        ...config,
        logo: {
          src,
          widthRatio: 0.22,
          margin: 6,
          borderRadius: 8,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* Sub-tabs header */}
      <div className="flex border-b border-slate-200/80 bg-slate-50/70 p-1.5 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'templates' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          模板预置
        </button>

        <button
          onClick={() => setActiveTab('dots')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'dots' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CircleDot className="h-3.5 w-3.5" />
          码点造型
        </button>

        <button
          onClick={() => setActiveTab('eyes')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'eyes' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          码眼设计
        </button>

        <button
          onClick={() => setActiveTab('colors')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'colors' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          色彩渐变
        </button>

        <button
          onClick={() => setActiveTab('logo')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'logo' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          中心Logo
        </button>

        <button
          onClick={() => setActiveTab('frame')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all ${
            activeTab === 'frame' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Frame className="h-3.5 w-3.5" />
          边框海报
        </button>
      </div>

      {/* Tab Panels */}
      <div className="p-5">
        {/* 1. Templates */}
        {activeTab === 'templates' && (
          <div className="flex flex-col gap-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              一键套用精选美化模板
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => onChange({ ...config, ...tmpl.config })}
                  className="flex flex-col items-start rounded-xl border border-slate-200 p-3.5 text-left transition-all hover:border-blue-400 hover:bg-slate-50/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-3 w-3 rounded-full shadow-sm"
                      style={{ backgroundColor: tmpl.previewColor }}
                    />
                    <span className="text-sm font-semibold text-slate-800">{tmpl.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{tmpl.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. Dots */}
        {activeTab === 'dots' && (
          <div className="flex flex-col gap-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              数据码点几何造型
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'square', label: '经典方块' },
                { id: 'rounded', label: '柔和圆角' },
                { id: 'dots', label: '圆润点阵' },
                { id: 'classy', label: '商务流线' },
                { id: 'extra-rounded', label: '大圆角' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => updateDots({ type: item.id as DotType })}
                  className={`rounded-xl border p-3 text-xs font-medium transition-all ${
                    config.dots.type === item.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. Eyes */}
        {activeTab === 'eyes' && (
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">
                寻象图形：外框造型
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'square', label: '经典正方' },
                  { id: 'extra-rounded', label: '平滑圆角' },
                  { id: 'dot', label: '圆形外框' },
                  { id: 'out-rounded', label: '单侧外圆' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => updateCornersSquare({ type: item.id as CornerSquareType })}
                    className={`rounded-xl border p-2.5 text-xs font-medium transition-all ${
                      config.cornersSquare.type === item.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">码眼外框颜色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.cornersSquare.color}
                    onChange={(e) => updateCornersSquare({ color: e.target.value })}
                    className="h-9 w-12 rounded cursor-pointer border border-slate-200 p-0.5"
                  />
                  <Input
                    value={config.cornersSquare.color}
                    onChange={(e) => updateCornersSquare({ color: e.target.value })}
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">码眼内芯颜色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.cornersDot.color}
                    onChange={(e) => updateCornersDot({ color: e.target.value })}
                    className="h-9 w-12 rounded cursor-pointer border border-slate-200 p-0.5"
                  />
                  <Input
                    value={config.cornersDot.color}
                    onChange={(e) => updateCornersDot({ color: e.target.value })}
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Colors */}
        {activeTab === 'colors' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                码点着色模式
              </Label>
              <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  onClick={() => updateDots({ colorType: 'single' })}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    config.dots.colorType === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  纯色
                </button>
                <button
                  onClick={() =>
                    updateDots({
                      colorType: 'gradient',
                      gradient: config.dots.gradient || {
                        type: 'linear',
                        rotation: 45,
                        colorStops: [
                          { offset: 0, color: '#2563eb' },
                          { offset: 1, color: '#9333ea' },
                        ],
                      },
                    })
                  }
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    config.dots.colorType === 'gradient' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  渐变色
                </button>
              </div>
            </div>

            {config.dots.colorType === 'single' ? (
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">选择单一颜色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.dots.color}
                    onChange={(e) => updateDots({ color: e.target.value })}
                    className="h-9 w-12 rounded cursor-pointer border border-slate-200 p-0.5"
                  />
                  <Input
                    value={config.dots.color}
                    onChange={(e) => updateDots({ color: e.target.value })}
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">渐变起始色</Label>
                    <input
                      type="color"
                      value={config.dots.gradient?.colorStops[0]?.color || '#2563eb'}
                      onChange={(e) =>
                        updateDots({
                          gradient: {
                            type: 'linear',
                            rotation: config.dots.gradient?.rotation || 45,
                            colorStops: [
                              { offset: 0, color: e.target.value },
                              { offset: 1, color: config.dots.gradient?.colorStops[1]?.color || '#9333ea' },
                            ],
                          },
                        })
                      }
                      className="h-9 w-full rounded cursor-pointer border border-slate-200 p-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">渐变终止色</Label>
                    <input
                      type="color"
                      value={config.dots.gradient?.colorStops[1]?.color || '#9333ea'}
                      onChange={(e) =>
                        updateDots({
                          gradient: {
                            type: 'linear',
                            rotation: config.dots.gradient?.rotation || 45,
                            colorStops: [
                              { offset: 0, color: config.dots.gradient?.colorStops[0]?.color || '#2563eb' },
                              { offset: 1, color: e.target.value },
                            ],
                          },
                        })
                      }
                      className="h-9 w-full rounded cursor-pointer border border-slate-200 p-0.5"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <Label className="text-xs text-slate-600 mb-1.5 block">二维码背景颜色</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.background.color}
                  onChange={(e) => onChange({ ...config, background: { color: e.target.value } })}
                  className="h-9 w-12 rounded cursor-pointer border border-slate-200 p-0.5"
                />
                <Input
                  value={config.background.color}
                  onChange={(e) => onChange({ ...config, background: { color: e.target.value } })}
                  className="font-mono text-xs uppercase"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. Logo */}
        {activeTab === 'logo' && (
          <div className="flex flex-col gap-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              中心 Logo 图标与安全边距
            </Label>
            <div className="flex items-center gap-4">
              {config.logo?.src ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <img src={config.logo.src} alt="logo" className="h-full w-full object-contain" />
                  <button
                    onClick={() => onChange({ ...config, logo: undefined })}
                    className="absolute top-0 right-0 rounded-bl bg-red-500 px-1 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="flex h-16 w-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-500 hover:border-blue-500 hover:text-blue-600">
                  <span>上传 Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              )}
              <div className="text-xs text-slate-400">
                <p>建议使用透明底 PNG 或高分辨率正方形图标。</p>
                <p className="mt-1 text-amber-600 font-medium">系统将自动开启 30% 最高纠错等级保护。</p>
              </div>
            </div>
          </div>
        )}

        {/* 6. Frame */}
        {activeTab === 'frame' && (
          <div className="flex flex-col gap-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              外框装饰海报样式
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'none', label: '无外框' },
                { id: 'polaroid', label: '拍立得卡片' },
                { id: 'banner-bottom', label: '底部横幅' },
                { id: 'bubble-top', label: '顶部气泡' },
                { id: 'badge', label: '标牌徽章' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => updateFrame({ style: item.id as any })}
                  className={`rounded-xl border p-2.5 text-xs font-medium transition-all ${
                    config.frame?.style === item.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {config.frame && config.frame.style !== 'none' && (
              <div className="flex flex-col gap-3 pt-2">
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">提示文案</Label>
                  <Input
                    value={config.frame.text}
                    onChange={(e) => updateFrame({ text: e.target.value })}
                    placeholder="如：微信扫一扫 了解详情"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">外框背景色</Label>
                    <input
                      type="color"
                      value={config.frame.backgroundColor}
                      onChange={(e) => updateFrame({ backgroundColor: e.target.value })}
                      className="h-9 w-full rounded cursor-pointer border border-slate-200 p-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">文字颜色</Label>
                    <input
                      type="color"
                      value={config.frame.textColor}
                      onChange={(e) => updateFrame({ textColor: e.target.value })}
                      className="h-9 w-full rounded cursor-pointer border border-slate-200 p-0.5"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
