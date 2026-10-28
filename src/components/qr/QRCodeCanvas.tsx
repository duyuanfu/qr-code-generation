'use client';

import React, { useEffect, useRef, useState } from 'react';
import { QRCodeStyleConfig } from '@/types/qr';
import { toQRCodeUTF8 } from '@/lib/qr-formatters';

interface QRCodeCanvasProps {
  value: string;
  config: QRCodeStyleConfig;
  className?: string;
  onInstanceReady?: (instance: any) => void;
}

export const QRCodeCanvas: React.FC<QRCodeCanvasProps> = ({
  value,
  config,
  className,
  onInstanceReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize or update QRCodeStyling
  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    let isCancelled = false;

    const setupQR = async () => {
      const QRCodeStyling = (await import('qr-code-styling')).default;

      // Construct options with UTF-8 byte stream conversion
      const options: any = {
        width: config.size || 300,
        height: config.size || 300,
        type: 'canvas',
        data: toQRCodeUTF8(value || 'https://example.com'),
        margin: config.margin ?? 16,
        qrOptions: {
          errorCorrectionLevel: config.logo?.src ? 'H' : config.errorCorrectionLevel || 'Q',
        },
        dotsOptions: {
          type: config.dots.type,
          color: config.dots.colorType === 'single' ? config.dots.color : undefined,
          gradient: config.dots.colorType === 'gradient' ? config.dots.gradient : undefined,
        },
        cornersSquareOptions: {
          type: config.cornersSquare.type,
          color: config.cornersSquare.color,
        },
        cornersDotOptions: {
          type: config.cornersDot.type,
          color: config.cornersDot.color,
        },
        backgroundOptions: {
          color: config.background.color,
        },
      };

      if (config.logo?.src) {
        options.image = config.logo.src;
        options.imageOptions = {
          hideBackgroundDots: true,
          imageSize: config.logo.widthRatio || 0.22,
          margin: config.logo.margin ?? 6,
        };
      }

      if (isCancelled || !containerRef.current) return;

      if (!qrRef.current) {
        const instance = new QRCodeStyling(options);
        qrRef.current = instance;
        containerRef.current.innerHTML = '';
        instance.append(containerRef.current);
        onInstanceReady?.(instance);
      } else {
        qrRef.current.update(options);
        onInstanceReady?.(qrRef.current);
      }
    };

    setupQR();

    return () => {
      isCancelled = true;
    };
  }, [isClient, value, config, onInstanceReady]);

  const frame = config.frame;

  return (
    <div
      className={`relative flex flex-col items-center justify-center transition-all ${className || ''}`}
      style={{
        backgroundColor:
          frame && frame.style === 'polaroid' ? frame.backgroundColor : 'transparent',
        padding: frame && frame.style === 'polaroid' ? '16px 16px 20px 16px' : '0px',
        borderRadius: frame && frame.style === 'polaroid' ? '16px' : '12px',
        boxShadow: frame && frame.style === 'polaroid' ? '0 10px 25px -5px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      {/* Top Bubble Frame */}
      {frame && frame.style === 'bubble-top' && (
        <div
          className="mb-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm animate-pulse"
          style={{
            backgroundColor: frame.backgroundColor,
            color: frame.textColor,
          }}
        >
          {frame.text}
        </div>
      )}

      {/* Top Badge Frame */}
      {frame && frame.style === 'badge' && (
        <div
          className="mb-2 px-3 py-1 rounded text-xs tracking-wider font-mono font-bold uppercase shadow-sm"
          style={{
            backgroundColor: frame.backgroundColor,
            color: frame.textColor,
          }}
        >
          {frame.text}
        </div>
      )}

      {/* QR Code Container */}
      <div
        ref={containerRef}
        className="flex items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm"
        style={{
          width: config.size || 300,
          height: config.size || 300,
        }}
      />

      {/* Bottom Polaroid Text */}
      {frame && frame.style === 'polaroid' && (
        <div
          className="mt-3 text-center text-sm font-semibold tracking-wide"
          style={{ color: frame.textColor }}
        >
          {frame.text}
        </div>
      )}

      {/* Bottom Banner Frame */}
      {frame && frame.style === 'banner-bottom' && (
        <div
          className="mt-2 w-full text-center py-1.5 px-3 rounded-lg text-xs font-medium shadow-sm"
          style={{
            backgroundColor: frame.backgroundColor,
            color: frame.textColor,
          }}
        >
          {frame.text}
        </div>
      )}
    </div>
  );
};
