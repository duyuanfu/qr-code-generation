'use client';

import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  description?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ title, description }) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          text: description || undefined,
          url: window.location.href,
        });
      } catch (e) {
        // user cancelled or share failed
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        // ignore
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors active:scale-95"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-600 font-semibold">链接已复制到剪贴板</span>
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          <span>转发分享此页面</span>
        </>
      )}
    </button>
  );
};
