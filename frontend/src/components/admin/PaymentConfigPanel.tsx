'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError, uploadSingleFile } from '@/lib/api-client';
import type { PaymentConfig, PaymentQrCode } from '@/types/admin';

export function PaymentConfigPanel() {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [channels, setChannels] = useState<PaymentQrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [uploadingChannel, setUploadingChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentConfig, qrCodes] = await Promise.all([
        apiFetch<PaymentConfig | null>('/api/admin/payment-config'),
        apiFetch<PaymentQrCode[]>('/api/admin/payment-qr-codes'),
      ]);
      setConfig(paymentConfig ?? { qrType: 'all', noticeText: '', qrImageUrl: '', enabled: 1 });
      setChannels(qrCodes ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '收款配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (channel: string, file: File | undefined) => {
    if (!file) return;
    setUploadingChannel(channel);
    setError(null);
    setNotice(null);
    try {
      const url = await uploadSingleFile(file);
      setChannels((prev) =>
        prev.map((c) => (c.channel === channel ? { ...c, imageUrl: url } : c))
      );
      setNotice('收款码图片已上传，请点击「保存」使其生效');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '上传失败');
    } finally {
      setUploadingChannel(null);
    }
  };

  const saveChannel = async (channel: PaymentQrCode) => {
    setSavingChannel(channel.channel);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/payment-qr-codes', {
        method: 'POST',
        body: JSON.stringify({ channel: channel.channel, imageUrl: channel.imageUrl || '' }),
      });
      setNotice(`${channel.channelName}收款码已保存`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存失败');
    } finally {
      setSavingChannel(null);
    }
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/payment-config', {
        method: 'POST',
        body: JSON.stringify({
          qrImageUrl: config.qrImageUrl || '',
          qrType: config.qrType,
          noticeText: config.noticeText || '',
          enabled: config.enabled,
        }),
      });
      setNotice('收款配置已保存，付费弹窗将立即使用新配置');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">收款码配置</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              微信、支付宝各上传一张；付费弹窗会按渠道切换展示对应收款码
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            刷新
          </Button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            加载中...
          </div>
        ) : (
          <div className="grid gap-5 p-5 md:grid-cols-2">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.channel}
                channel={channel}
                uploading={uploadingChannel === channel.channel}
                saving={savingChannel === channel.channel}
                onUpload={(file) => handleUpload(channel.channel, file)}
                onChange={(url) =>
                  setChannels((prev) =>
                    prev.map((c) => (c.channel === channel.channel ? { ...c, imageUrl: url } : c))
                  )
                }
                onSave={() => saveChannel(channel)}
              />
            ))}
            {channels.length === 0 && (
              <p className="text-xs text-slate-500">尚未初始化收款渠道，请重启后端服务。</p>
            )}
          </div>
        )}
      </div>

      {config && !loading && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-800">扫码提示与付费墙</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              提示文案会展示在付费弹窗底部，建议写明服务期与合规免责说明
            </p>
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                扫码提示文案
              </Label>
              <textarea
                value={config.noticeText || ''}
                onChange={(e) =>
                  setConfig((prev) => (prev ? { ...prev, noticeText: e.target.value } : prev))
                }
                rows={4}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="扫码支付后点【我已完成支付】等待核销放行。价格为 3 个月服务期，到期请自行续费；仅可发布合规合法信息，因客户自身内容违规导致二维码无法使用的，由客户自行负责。"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">启用付费墙</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  关闭后所有入口不再拦截付费，全部免费放行
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) =>
                    prev ? { ...prev, enabled: prev.enabled === 1 ? 0 : 1 } : prev
                  )
                }
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  config.enabled === 1 ? 'bg-blue-600' : 'bg-slate-300'
                }`}
                aria-label="切换付费墙开关"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    config.enabled === 1 ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                保存配置
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ChannelCardProps {
  channel: PaymentQrCode;
  uploading: boolean;
  saving: boolean;
  onUpload: (file: File | undefined) => void;
  onChange: (url: string) => void;
  onSave: () => void;
}

function ChannelCard({ channel, uploading, saving, onUpload, onChange, onSave }: ChannelCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isWechat = channel.channel === 'wechat';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 p-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white ${
            isWechat ? 'bg-emerald-500' : 'bg-blue-500'
          }`}
        >
          {isWechat ? '微' : '支'}
        </span>
        <span className="text-sm font-semibold text-slate-800">{channel.channelName}</span>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-[132px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
          {channel.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.imageUrl}
              alt={`${channel.channelName}收款码`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="px-2 text-center text-[11px] text-slate-400">尚未上传</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files?.[0]);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1.5"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            上传图片
          </Button>
          <Input
            value={channel.imageUrl || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/uploads/xxx.png"
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          保存
        </Button>
      </div>
    </div>
  );
}
