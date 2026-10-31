'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  QrCode,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Zap,
  CalendarClock,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthContext';
import { authHeaders } from '@/lib/api-client';
import { CONTENT_TYPE_LABEL, type PaymentConfig, type PaymentQrCode, type PricingConfig } from '@/types/admin';
import type { MediaItem } from '@/types/qr';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: 'dynamic_qr' | 'static_export';
  /** 二维码内容类型：决定命中哪一条定价（按类型分别配置） */
  contentType?: string;
  /** 本次要托管的媒体文件，服务端按真实体积计算阶梯价 */
  mediaUrls?: MediaItem[];
  onSuccess: (orderId: string) => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  actionType,
  contentType,
  mediaUrls,
  onSuccess,
}) => {
  const { user, openAuthModal } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [channels, setChannels] = useState<PaymentQrCode[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('');
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [statusText, setStatusText] = useState<'pending' | 'pending_review' | 'paid'>('pending');
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const totalBytes = useMemo(
    () => (mediaUrls || []).reduce((sum, item) => sum + (Number(item.size) || 0), 0),
    [mediaUrls]
  );

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Initialize order when opened
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setOrder(null);
      setError(null);
      return;
    }

    if (!user) {
      onClose();
      openAuthModal();
      return;
    }

    const initOrder = async () => {
      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // 1. Fetch public payment config, pricing & channel QR codes
        const configRes = await fetch('/api/payment/config');
        const configData = await configRes.json();
        if (configData.success) {
          setPaymentConfig(configData.data?.payment ?? null);
          const pricingList: PricingConfig[] = configData.data?.pricing ?? [];
          const specificKey = contentType ? `${actionType}.${contentType}` : actionType;
          setPricing(
            pricingList.find((p) => p.itemKey === specificKey) ??
              pricingList.find((p) => p.itemKey === actionType) ??
              null
          );

          const qrList: PaymentQrCode[] = (configData.data?.paymentQrs ?? []).filter(
            (q: PaymentQrCode) => q.enabled !== 0
          );
          setChannels(qrList);
          const firstWithImage = qrList.find((q) => q.imageUrl);
          if (firstWithImage) setActiveChannel(firstWithImage.channel);
          else if (qrList.length > 0) setActiveChannel(qrList[0].channel);
        }

        // 2. Create order（带上媒体列表，服务端按落盘文件真实体积算阶梯价）
        const orderRes = await fetch('/api/order/create', {
          method: 'POST',
          headers: authHeaders(headers),
          body: JSON.stringify({
            actionType,
            contentType,
            mediaUrls: (mediaUrls || []).map((m) => ({ url: m.url, size: m.size })),
          }),
        });
        const orderData = await orderRes.json();

        if (!orderData.success) {
          setError(orderData.message || '订单创建失败');
          setLoading(false);
          return;
        }

        const newOrder = orderData.data;
        setOrder(newOrder);

        // If user is admin or free
        if (newOrder.status === 'paid' || Number(newOrder.amount) <= 0) {
          setStatusText('paid');
          setTimeout(() => {
            onSuccess(newOrder.id);
            onClose();
          }, 600);
          return;
        }

        setStatusText(newOrder.status);
      } catch (err: any) {
        setError(err.message || '网络连接异常');
      } finally {
        setLoading(false);
      }
    };

    initOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  // Poll order status
  const startPolling = (orderId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/status/${orderId}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success && data.data) {
          const currentStatus = data.data.status;
          if (currentStatus === 'paid') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setStatusText('paid');
            setTimeout(() => {
              onSuccess(orderId);
              onClose();
            }, 800);
          }
        }
      } catch (ignored) {}
    }, 2000);
  };

  // User clicks "我已完成支付"
  const handleConfirmPayment = async () => {
    if (!order) return;
    try {
      const res = await fetch('/api/order/confirm', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusText('pending_review');
        startPolling(order.id);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || '提交确认失败');
    }
  };

  // Developer / Demo mode mock pay
  const handleMockPay = async () => {
    if (!order) return;
    try {
      const res = await fetch('/api/order/mock-pay', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusText('paid');
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setTimeout(() => {
          onSuccess(order.id);
          onClose();
        }, 600);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || '模拟支付失败');
    }
  };

  if (!isOpen) return null;

  const amount = Number(order?.amount || 0);
  const basePrice = Number(pricing?.price || 0);
  const includedMb = pricing?.includedSizeMb || 0;
  const stepMb = pricing?.stepSizeMb || 0;
  const stepPrice = Number(pricing?.stepPrice || 0);
  const validMonths = pricing?.validMonths || 0;
  const currentChannel = channels.find((c) => c.channel === activeChannel) || channels[0] || null;
  const typeLabel = contentType ? CONTENT_TYPE_LABEL[contentType] : '';
  /** 按件累加：N 个文件 = N 份基础价，体积阶梯也按单件算 */
  const perItem = pricing?.perItem === 1;
  const itemCount = (mediaUrls || []).length;
  const unitCount = perItem ? Math.max(1, itemCount) : 1;
  const unitName =
    contentType === 'image' ? '张' : contentType === 'video' ? '条' : contentType === 'pdf' ? '份' : '个';
  // 基础价合计之后的差额才是体积加收（不能直接用 amount - 单价）
  const surcharge = Math.max(0, amount - basePrice * unitCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col items-center overflow-y-auto overscroll-contain rounded-3xl border border-slate-100 bg-white p-5 pb-safe shadow-2xl sm:p-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="关闭支付窗口"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Modal Title */}
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20">
            <QrCode className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {actionType === 'dynamic_qr'
              ? `开通${typeLabel ? `「${typeLabel}」` : '多媒体'}动态活码${perItem && itemCount > 1 ? `（${itemCount} ${unitName}）` : ''}`
              : '购买二维码图片导出'}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {actionType === 'dynamic_qr'
              ? '支付后自动生成活码，扫码即可查看内容'
              : '支付后可导出真实内容的高清二维码 PNG（单张下载 / 打印 / 批量 ZIP）'}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
            <span className="text-xs">正在准备专属订单...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="h-10 w-10 text-rose-500" aria-hidden="true" />
            <p className="text-xs text-rose-600">{error}</p>
            <Button size="sm" onClick={onClose} variant="outline" className="mt-2 text-xs">
              返回
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-4">
            {/* Price Tag */}
            <div className="flex items-baseline gap-1 text-slate-900">
              <span className="text-sm font-semibold">¥</span>
              <span className="text-3xl font-extrabold tracking-tight">{amount.toFixed(2)}</span>
              <span className="ml-1 text-xs text-slate-400">
                {perItem && unitCount > 1 ? `/ ${unitCount} ${unitName}` : '/ 次'}
              </span>
            </div>

            {/* Price breakdown */}
            <div className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">
                  {perItem ? `基础价 ¥${basePrice.toFixed(2)} × ${unitCount} ${unitName}` : '基础价'}
                </span>
                <span className="font-medium">¥{(basePrice * unitCount).toFixed(2)}</span>
              </div>
              {includedMb > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-500">
                    <HardDrive className="h-3 w-3" aria-hidden="true" />
                    含 {includedMb}MB 体积{perItem ? '（每' + unitName + '）' : ''}
                  </span>
                  <span
                    className={
                      totalBytes > 0 && totalBytes / 1024 / 1024 > includedMb * unitCount
                        ? 'font-medium text-amber-600'
                        : 'text-slate-400'
                    }
                  >
                    本次 {formatMb(totalBytes)}MB
                  </span>
                </div>
              )}
              {surcharge > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-500">
                    超出体积加收（每 {stepMb}MB +¥{stepPrice.toFixed(0)}）
                  </span>
                  <span className="font-medium text-amber-600">+¥{surcharge.toFixed(2)}</span>
                </div>
              )}
              {validMonths > 0 ? (
                <div className="mt-1.5 flex items-center justify-between border-t border-slate-200/70 pt-1.5">
                  <span className="flex items-center gap-1 text-slate-500">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    服务有效期
                  </span>
                  <span className="font-medium text-slate-700">{validMonths} 个月（到期需续费）</span>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center justify-between border-t border-slate-200/70 pt-1.5">
                  <span className="flex items-center gap-1 text-slate-500">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    服务有效期
                  </span>
                  <span className="font-medium text-emerald-600">永久有效（内容不存服务器）</span>
                </div>
              )}
            </div>

            {/* Channel switch */}
            {channels.length > 1 && (
              <div className="flex w-full gap-2">
                {channels.map((channel) => (
                  <button
                    key={channel.channel}
                    type="button"
                    onClick={() => setActiveChannel(channel.channel)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      activeChannel === channel.channel
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {channel.channelName}
                  </button>
                ))}
              </div>
            )}

            {/* Collection QR Code Image */}
            <div className="relative flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-3 shadow-inner">
              {currentChannel?.imageUrl || (!currentChannel && paymentConfig?.qrImageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentChannel?.imageUrl || paymentConfig?.qrImageUrl || ''}
                  alt={`${currentChannel?.channelName || '收款'}二维码`}
                  className="h-48 w-48 rounded-xl bg-white object-contain shadow-sm"
                />
              ) : (
                <div className="flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-xl bg-white text-center text-xs text-slate-400">
                  <QrCode className="h-8 w-8 text-slate-300" aria-hidden="true" />
                  管理员尚未上传
                  <br />
                  {currentChannel?.channelName || '收款'}二维码
                </div>
              )}
              <span className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                请使用{currentChannel?.channelName || '微信 / 支付宝'}扫一扫支付 ¥{amount.toFixed(2)}
              </span>
            </div>

            {/* Order Info & Notice */}
            <div className="flex w-full flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">订单编号:</span>
                <span className="font-mono font-medium">{order?.orderNo}</span>
              </div>
              <p className="mt-1 leading-relaxed text-slate-500">
                {paymentConfig?.noticeText ||
                  '扫码支付后点【我已完成支付】等待核销放行。动态活码为 3 个月服务期，到期请自行续费；静态二维码内容不存服务器，永久有效。仅可发布合规合法信息，因客户自身内容违规导致二维码无法使用的，由客户自行负责。'}
              </p>
            </div>

            {/* Status indicator */}
            {statusText === 'pending_review' && (
              <div className="flex w-full animate-pulse items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                <Clock className="h-4 w-4 shrink-0 animate-spin text-blue-500" aria-hidden="true" />
                <span>已提交支付申请！正在等待管理员审核核销放行...</span>
              </div>
            )}

            {statusText === 'paid' && (
              <div className="flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span>支付核验成功！正在为您生成二维码...</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-1 flex w-full flex-col gap-2">
              <Button
                onClick={handleConfirmPayment}
                disabled={statusText === 'paid' || statusText === 'pending_review'}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/10 hover:from-blue-700 hover:to-indigo-700"
              >
                {statusText === 'pending_review' ? '等待管理员审核到账...' : '我已完成支付'}
              </Button>

              {/* Developer / Demo Quick Mock Pay */}
              <button
                type="button"
                onClick={handleMockPay}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200/60 bg-indigo-50/80 py-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-800"
              >
                <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                <span>【测试环境】一键模拟快捷支付放行</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
