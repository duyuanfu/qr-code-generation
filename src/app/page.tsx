'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Header } from '@/components/workspace/Header';
import { ContentTypeSelector } from '@/components/workspace/ContentTypeSelector';
import { ContentForm } from '@/components/workspace/ContentForm';
import { StyleConfigPanel } from '@/components/workspace/StyleConfigPanel';
import { DualPreview } from '@/components/workspace/DualPreview';
import { BatchGenerator } from '@/components/workspace/BatchGenerator';
import { BatchDecoder } from '@/components/workspace/BatchDecoder';
import { QRContentType, VCardData, WiFiData, MediaItem, QRCodeStyleConfig } from '@/types/qr';
import { DEFAULT_STYLE_CONFIG } from '@/lib/qr-templates';
import { formatQRContent } from '@/lib/qr-formatters';
import { Wifi, Globe, Smartphone, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function Home() {
  const [currentTab, setCurrentTab] = useState<'single' | 'batch-generate' | 'batch-decode'>('single');
  const [contentType, setContentType] = useState<QRContentType>('url');

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
  const [wifiData, setWiFiData] = useState<WiFiData>({
    ssid: 'Office-HighSpeed-5G',
    password: 'password123456',
    encryption: 'WPA',
    hidden: false,
  });

  // Dynamic Media States
  const [mediaTitle, setMediaTitle] = useState('2025年产品手册与演示资源');
  const [mediaDesc, setMediaDesc] = useState('扫码即可在线浏览多媒体资料或直接下载完整附件文件。');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [dynamicShortCode, setDynamicShortCode] = useState<string>('');
  const [isSavingDynamic, setIsSavingDynamic] = useState(false);

  // Network Host Configuration
  const [customHost, setCustomHost] = useState<string>('');
  const [availableIps, setAvailableIps] = useState<string[]>([]);

  useEffect(() => {
    // Detect server IPs for LAN mobile scanning
    fetch('/api/system/network')
      .then((res) => res.json())
      .then((data) => {
        if (data.addresses && data.addresses.length > 0) {
          setAvailableIps(data.addresses);
          if (typeof window !== 'undefined') {
            const port = window.location.port ? `:${window.location.port}` : '';
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              setCustomHost(`http://${data.addresses[0]}${port}`);
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
  const handleSaveDynamic = async (itemsToSave: MediaItem[] = mediaList, targetType: QRContentType = contentType) => {
    if (itemsToSave.length === 0) return;
    setIsSavingDynamic(true);
    try {
      const res = await fetch('/api/qr/dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: targetType,
          title: mediaTitle,
          description: mediaDesc,
          mediaUrls: itemsToSave,
          styleConfig,
        }),
      });

      const data = await res.json();
      if (data.success && data.shortCode) {
        setDynamicShortCode(data.shortCode);
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
    if (['image', 'video', 'pdf', 'file'].includes(contentType)) {
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
      case 'wifi':
        return formatQRContent('wifi', wifiData);
      default:
        return 'https://example.com';
    }
  }, [contentType, urlValue, textValue, vcardData, wifiData, dynamicShortCode, baseHost]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70">
      {/* Top Navigation */}
      <Header currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Main Workspace Area */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
            {/* Left Configuration Panel (Col 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* 1. Content Type Switcher */}
              <ContentTypeSelector
                currentType={contentType}
                onSelectType={(t) => {
                  setContentType(t);
                  setDynamicShortCode('');
                  if (mediaList.length > 0) {
                    handleSaveDynamic(mediaList, t);
                  }
                }}
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
                wifiData={wifiData}
                onWiFiChange={setWiFiData}
                mediaTitle={mediaTitle}
                onMediaTitleChange={setMediaTitle}
                mediaDesc={mediaDesc}
                onMediaDescChange={setMediaDesc}
                mediaList={mediaList}
                onMediaListChange={(items) => {
                  setMediaList(items);
                  if (items.length > 0) {
                    handleSaveDynamic(items, contentType);
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
                      <Smartphone className="h-4 w-4 text-blue-600" />
                      手机扫码访问基址设置
                    </span>
                    {dynamicShortCode ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" /> 正式活码已就绪
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3.5 w-3.5" /> 预览演示状态 (上传后自动生成)
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
                      <ExternalLink className="h-3.5 w-3.5" />
                      电脑测试打开
                    </a>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
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
                          <Wifi className="h-3.5 w-3.5 text-blue-600" />
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
                config={styleConfig}
                contentType={contentType}
                mediaTitle={mediaTitle}
                mediaDesc={mediaDesc}
                mediaList={mediaList}
              />
            </div>
          </div>
        )}

        {currentTab === 'batch-generate' && <BatchGenerator />}

        {currentTab === 'batch-decode' && <BatchDecoder />}
      </main>
    </div>
  );
}
