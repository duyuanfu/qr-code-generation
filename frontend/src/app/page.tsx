'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/workspace/Header';
import { ContentTypeSelector } from '@/components/workspace/ContentTypeSelector';
import { ContentForm } from '@/components/workspace/ContentForm';
import { StyleConfigPanel } from '@/components/workspace/StyleConfigPanel';
import { DualPreview } from '@/components/workspace/DualPreview';
import { QRContentType, VCardData, MediaItem, QRCodeStyleConfig } from '@/types/qr';
import { DEFAULT_STYLE_CONFIG } from '@/lib/qr-templates';
import { formatQRContent } from '@/lib/qr-formatters';
import { FEATURES } from '@/lib/features';
import { Wifi, Smartphone, ExternalLink, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/AuthContext';
import { PaymentModal } from '@/components/workspace/PaymentModal';

/**
 * 批量作业两个模块必须**按需加载**。
 *
 * 它们都 `import * as XLSX`，光这一个库就 400KB+。静态 import 的后果是：
 * 哪怕批量生成被关掉了、用户只想生成一张二维码，首屏也要把这坨下载下来。
 * 换成 next/dynamic 后，只有真正切到该 tab 才会拉取对应 chunk。
 */
const BatchGenerator = dynamic(
  () => import('@/components/workspace/BatchGenerator').then((m) => m.BatchGenerator),
  { ssr: false }
);
const BatchDecoder = dynamic(
  () => import('@/components/workspace/BatchDecoder').then((m) => m.BatchDecoder),
  { ssr: false }
);

/** 动态活码的默认描述文案，切换类型时回到这个值 */
const DEFAULT_MEDIA_DESC = '扫码即可在线浏览多媒体资料或直接下载完整附件文件。';

/** 需要上传文件、走付费墙的内容类型 */
const DYNAMIC_TYPES: QRContentType[] = ['image', 'video', 'pdf', 'file'];
const isDynamicType = (t: QRContentType) => DYNAMIC_TYPES.includes(t);

/**
 * 批量生成功能开关（定义在 lib/features.ts，Header 也要读它来打「内测」标记）。
 *
 * 生产环境暂不开放。这里**只拦截入口**，组件本身仍在仓库里 ——
 * 要做的是把开关改成 true 就能恢复，而不是去 git 里翻回来。
 * 切到该 tab 时弹一个「后期支持」的提示，不切换页面，
 * 避免用户对着一个不能用的界面点半天。
 */
const BATCH_GENERATE_ENABLED = FEATURES.batchGenerate;

/**
 * 未解锁时预览区渲染的演示内容。
 *
 * 静态二维码的像素一旦在浏览器里画出来就无法阻止截图，唯一有效的做法是
 * 让未付费用户看到的根本不是你输入的内容——截图得到的是一张指向演示页的废码。
 * 结构刻意与真实内容保持一致（vCard 还是 vCard），保证图案密度接近。
 */
const DEMO_VCARD: VCardData = {
  firstName: '三',
  lastName: '张',
  phone: '13800000000',
  email: 'demo@qrstudio.local',
  organization: 'QR Studio 演示名片',
  title: '未解锁预览',
  website: 'https://qr.studio/preview',
  address: '演示地址',
};

export default function Home() {
  const { user, openAuthModal } = useAuth();
  const [currentTab, setCurrentTab] = useState<'single' | 'batch-generate' | 'batch-decode'>('single');
  /** 点了尚未开放的「批量生成」时弹出的说明窗 */
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [contentType, setContentType] = useState<QRContentType>('url');
  const isDynamicContent = ['image', 'video', 'pdf', 'file'].includes(contentType);
  const [isDynamicPayModalOpen, setIsDynamicPayModalOpen] = useState(false);
  const [pendingSaveContext, setPendingSaveContext] = useState<{
    items: MediaItem[];
    targetType: QRContentType;
    title: string;
  } | null>(null);

  // Static Form States
  const [urlValue, setUrlValue] = useState('https://github.com');
  const [textValue, setTextValue] = useState('欢迎使用 QR Studio 全能二维码美化工作台！');
  const [vcardData, setVCardData] = useState<VCardData>({
    firstName: '三',
    lastName: '张',
    phone: '13800000000',
    email: 'zhangsan@example.com',
    organization: '科技有限公司',
    title: '创始人 & 首席架构师',
    website: 'https://example.com',
    address: '北京市海淀区科技园',
  });

  // Dynamic Media States
  // 标题留空：上传文件后会自动填入文件名（见 ContentForm.applyAutoTitle）
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDesc, setMediaDesc] = useState('扫码即可在线浏览多媒体资料或直接下载完整附件文件。');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [dynamicShortCode, setDynamicShortCode] = useState<string>('');
  const [isSavingDynamic, setIsSavingDynamic] = useState(false);
  /** 已付费解锁的二维码内容；换内容即失效，需要重新购买 */
  const [paidValue, setPaidValue] = useState<string>('');

  // Network Host Configuration
  const [customHost, setCustomHost] = useState<string>('');
  const [availableIps, setAvailableIps] = useState<string[]>([]);

  /**
   * 每种「动态类型」各自的现场（已上传文件、标题、描述、已生成的短码）。
   *
   * 为什么要按类型分开存：
   * 1. 切换标签绝不能再弹一次付费窗 —— 用户只是看看别的类型，不是要再买一单。
   * 2. 切换标签必须换掉文件列表 —— 否则「视频」页上传的 mp4 会跟着进「PDF」页，
   *    最终生成一个 contentType=pdf 但内容是视频的活码，扫码自然打开的是视频。
   * 3. 切走再切回来要能拿回原来的活码，不能让已付费的 8 元订单白付一次。
   *
   * 用 ref 而不是 state：这份数据只在切换类型的回调里读写，不参与渲染。
   * 放在 state 里反而会引入「连点两次切换时读到上一帧旧快照」的竞态。
   */
  const dynamicDraftsRef = useRef<
    Partial<Record<QRContentType, { mediaList: MediaItem[]; mediaTitle: string; mediaDesc: string; shortCode: string; paidValue: string }>>
  >({});

  /**
   * 切换内容类型。
   *
   * 这里刻意**不作为**的几件事：
   * - 不调用 handleSaveDynamic：切换类型不是生成动作，一调用就会因为「无已付订单」
   *   再度弹出支付窗，这正是用户反馈的「切 tab 反复弹付费窗」。
   * - 不保留上一类的 mediaList：状态串味会让订单内容与所选类型对不上。
   */
  const handleSelectType = (next: QRContentType) => {
    if (next === contentType) return;

    // 任何待支付的上下文都作废：否则用户在 pdf 页关掉支付窗后，可能被一个
    // 属于视频页的 pendingSaveContext 引导去支付错误的内容。
    setIsDynamicPayModalOpen(false);
    setPendingSaveContext(null);

    const prevDynamic = isDynamicType(contentType);
    const nextDynamic = isDynamicType(next);

    if (prevDynamic) {
      dynamicDraftsRef.current[contentType] = {
        mediaList,
        mediaTitle,
        mediaDesc,
        shortCode: dynamicShortCode,
        paidValue,
      };
    }

    setContentType(next);

    if (nextDynamic) {
      // 恢复该类别的现场；没有现场就是干净的空状态
      const draft = dynamicDraftsRef.current[next];
      setMediaList(draft?.mediaList ?? []);
      setMediaTitle(draft?.mediaTitle ?? '');
      setMediaDesc(draft?.mediaDesc ?? DEFAULT_MEDIA_DESC);
      setDynamicShortCode(draft?.shortCode ?? '');
      setPaidValue(draft?.paidValue ?? '');
    } else {
      // 静态类型不持有文件；动态现场已经存进 drafts，这里只要清空当前视图
      setMediaList([]);
      setMediaTitle('');
      setMediaDesc(DEFAULT_MEDIA_DESC);
      setDynamicShortCode('');
      if (prevDynamic) setPaidValue('');
    }
  };

  /**
   * 顶部 tab 切换。
   *
   * 「批量生成」暂未开放：这里**不切 tab**，只弹提示。否则用户会落到一个看似可用、
   * 实则处处拦路的界面，比直接说「还没好」更糟糕。
   */
  const handleTabChange = (tab: 'single' | 'batch-generate' | 'batch-decode') => {
    if (tab === 'batch-generate' && !BATCH_GENERATE_ENABLED) {
      setComingSoonOpen(true);
      return;
    }
    setCurrentTab(tab);
  };

  // 弹窗支持 Esc 关闭：只用鼠标点遮罩关不掉的弹窗，键盘用户会被困住
  useEffect(() => {
    if (!comingSoonOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComingSoonOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [comingSoonOpen]);

  useEffect(() => {
    // Detect server IPs for LAN mobile scanning
    fetch('/api/system/network')      .then((res) => res.json())
      .then((json) => {
        // 后端统一用 { success, code, message, data } 包装
        const ips: string[] = json?.data?.addresses ?? json?.addresses ?? [];
        if (ips.length > 0) {
          setAvailableIps(ips);
          if (typeof window !== 'undefined') {
            const port = window.location.port ? `:${window.location.port}` : '';
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              setCustomHost(`http://${ips[0]}${port}`);
            } else {
              setCustomHost(window.location.origin);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // Styling Config State
  const [styleConfig, setStyleConfig] = useState<QRCodeStyleConfig>(DEFAULT_STYLE_CONFIG);

  // Dynamic QR Save Handler
  const handleSaveDynamic = async (
    itemsToSave: MediaItem[] = mediaList,
    targetType: QRContentType = contentType,
    paidOrderId?: string,
    titleOverride?: string
  ) => {
    if (itemsToSave.length === 0) return;

    // 上传后自动填充的标题还没进 state（React 更新是异步的），这里用回调带来的值兜底
    const effectiveTitle = titleOverride ?? mediaTitle;

    if (!user) {
      openAuthModal();
      return;
    }

    if (user.role !== 'admin' && !paidOrderId) {
      setPendingSaveContext({ items: itemsToSave, targetType, title: effectiveTitle });
      setIsDynamicPayModalOpen(true);
      return;
    }

    setIsSavingDynamic(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/qr/dynamic', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contentType: targetType,
          title: effectiveTitle,
          description: mediaDesc,
          mediaUrls: itemsToSave,
          styleConfig,
          orderId: paidOrderId,
        }),
      });

      const data = await res.json();
      if (data.success && data.data?.shortCode) {
        setDynamicShortCode(data.data.shortCode);
      } else if (data.message) {
        alert(data.message);
      }
    } catch (err) {
      console.error('Failed to create dynamic QR:', err);
    } finally {
      setIsSavingDynamic(false);
    }
  };

  // Derive base URL for QR codes
  const baseHost = useMemo(() => {
    if (customHost.trim()) {
      return customHost.trim().replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://localhost:3001';
  }, [customHost]);

  // Derive QR Raw Value
  const qrRawValue = useMemo(() => {
    if (isDynamicContent) {
      if (dynamicShortCode) {
        return `${baseHost}/q/${dynamicShortCode}`;
      }
      return `${baseHost}/q/preview`;
    }

    switch (contentType) {
      case 'url':
        return formatQRContent('url', urlValue);
      case 'text':
        return formatQRContent('text', textValue);
      case 'vcard':
        return formatQRContent('vcard', vcardData);
      default:
        return 'https://example.com';
    }
  }, [contentType, urlValue, textValue, vcardData, dynamicShortCode, baseHost, isDynamicContent]);

  // 未解锁时的演示内容
  const previewQrValue = useMemo(() => {
    if (isDynamicContent) return `${baseHost}/q/preview`;

    switch (contentType) {
      case 'url':
        return 'https://qr.studio/preview-demo';
      case 'text':
        return '这是预览模式下的示例文本，解锁后才会写入你输入的真实内容。';
      case 'vcard':
        return formatQRContent('vcard', DEMO_VCARD);
      default:
        return 'https://qr.studio/preview-demo';
    }
  }, [contentType, baseHost, isDynamicContent]);

  // 权限：管理员全放行；动态活码付过费（已有短码）即可显示真实码
  // 注意必须挂在 user 上：退出登录后不能仅凭残留的 paidValue 继续预览/导出
  const exportUnlocked =
    !!user &&
    (user.role === 'admin' ||
      // 动态活码的「内容」已经付过费，二维码图片本身不应再收一次导出费。
      // 否则用户花 8 元买了视频活码，点「下载二维码」又被弹一次 2 元的静态导出价。
      (isDynamicContent && !!dynamicShortCode) ||
      (paidValue !== '' && paidValue === qrRawValue));
  const previewUnlocked = !!user && (exportUnlocked || (isDynamicContent && !!dynamicShortCode));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70">
      {/* Top Navigation */}
      <Header currentTab={currentTab} onTabChange={handleTabChange} />

      {/* Main Workspace Area */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
            {/* Left Configuration Panel (Col 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* 1. Content Type Switcher */}
              <ContentTypeSelector
                currentType={contentType}
                onSelectType={handleSelectType}
              />

              {/* 2. Content Form */}
              <ContentForm
                type={contentType}
                urlValue={urlValue}
                onUrlChange={setUrlValue}
                textValue={textValue}
                onTextChange={setTextValue}
                vcardData={vcardData}
                onVCardChange={setVCardData}
                mediaTitle={mediaTitle}
                onMediaTitleChange={setMediaTitle}
                mediaDesc={mediaDesc}
                onMediaDescChange={setMediaDesc}
                mediaList={mediaList}
                onMediaListChange={(items, effectiveTitle, reason) => {
                  setMediaList(items);
                  // 只有「新上传」才自动进入付费流程。
                  // 删除资源、切换类型都不是购买意图，在这里再弹一次付费窗就是骚扰。
                  if (reason === 'upload' && items.length > 0) {
                    handleSaveDynamic(items, contentType, undefined, effectiveTitle);
                  }
                }}
                onDynamicSave={() => handleSaveDynamic(mediaList, contentType)}
                isSavingDynamic={isSavingDynamic}
                dynamicShortCode={dynamicShortCode}
              />

              {/* Notice & Setting for Mobile Scanning of Dynamic QRs */}
              {['image', 'video', 'pdf', 'file'].includes(contentType) && (
                <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      手机扫码访问基址设置
                    </span>
                    {dynamicShortCode ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 正式活码已就绪
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> 预览演示状态 (上传后自动生成)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={customHost}
                      onChange={(e) => setCustomHost(e.target.value)}
                      placeholder="如: http://192.168.1.100:3001 或 您的外网域名"
                      className="text-xs font-mono"
                    />
                    <a
                      href={qrRawValue}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      电脑测试打开
                    </a>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-500">
                    <strong>为什么手机扫 localhost 报错？</strong> 手机扫码访问的是手机自己本地，必须填写你的<strong>局域网 IP（手机连同一 WiFi）</strong>或<strong>外网域名</strong>。点击快捷填入：
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCustomHost(window.location.origin)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                        customHost === window.location.origin
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      当前浏览器域名 ({typeof window !== 'undefined' ? window.location.host : 'localhost'})
                    </button>
                    {availableIps.map((ip) => {
                      const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
                      const candidate = `http://${ip}${port}`;
                      return (
                        <button
                          key={ip}
                          onClick={() => setCustomHost(candidate)}
                          className={`px-2.5 py-1 rounded-lg border text-xs transition-all flex items-center gap-1.5 ${
                            customHost === candidate
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Wifi className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                          局域网IP: {ip}{port}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Style and Templates Configuration */}
              <StyleConfigPanel
                config={styleConfig}
                onChange={setStyleConfig}
              />
            </div>

            {/* Right Sticky Preview & Actions Panel (Col 5) */}
            <div className="lg:col-span-5">
              <DualPreview
                value={qrRawValue}
                previewValue={previewQrValue}
                config={styleConfig}
                contentType={contentType}
                mediaTitle={mediaTitle}
                mediaDesc={mediaDesc}
                mediaList={mediaList}
                previewUnlocked={previewUnlocked}
                exportUnlocked={exportUnlocked}
                onExportUnlocked={() => setPaidValue(qrRawValue)}
              />
            </div>
          </div>
        )}

        {currentTab === 'batch-generate' && BATCH_GENERATE_ENABLED && <BatchGenerator />}

        {currentTab === 'batch-decode' && <BatchDecoder />}
      </main>

      {/* Dynamic QR Paywall Modal */}
      <PaymentModal
        isOpen={isDynamicPayModalOpen}
        onClose={() => {
          setIsDynamicPayModalOpen(false);
          setPendingSaveContext(null);
        }}
        actionType="dynamic_qr"
        contentType={pendingSaveContext?.targetType ?? contentType}
        mediaUrls={pendingSaveContext?.items ?? mediaList}
        onSuccess={(orderId) => {
          setIsDynamicPayModalOpen(false);
          if (pendingSaveContext) {
            handleSaveDynamic(
              pendingSaveContext.items,
              pendingSaveContext.targetType,
              orderId,
              pendingSaveContext.title
            );
            setPendingSaveContext(null);
          }
        }}
      />

      {/* 「批量生成」暂未开放提示 */}
      {comingSoonOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setComingSoonOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coming-soon-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <Layers className="h-6 w-6" aria-hidden="true" />
            </div>

            <h2 id="coming-soon-title" className="mt-4 text-base font-bold text-slate-900">
              批量生成正在内测中
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              该功能暂未对外开放，我们正在做最后的稳定性验证，后续会在这里上线。
              目前可以先使用「单个生成与美化」，同样支持全部二维码类型与样式模板。
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setComingSoonOpen(false)}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                知道了
              </button>
              <button
                onClick={() => {
                  setComingSoonOpen(false);
                  setCurrentTab('single');
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                去单个生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
