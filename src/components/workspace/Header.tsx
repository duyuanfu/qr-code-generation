import React from 'react';
import { QrCode, Layers, ScanLine, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  currentTab: 'single' | 'batch-generate' | 'batch-decode';
  onTabChange: (tab: 'single' | 'batch-generate' | 'batch-decode') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur transition-all">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
          <QrCode className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-slate-900 text-lg">QR Studio</span>
            <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
              PRO
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">全能二维码生成与美化工作台</p>
        </div>
      </div>

      {/* Main Mode Navigation */}
      <div className="flex items-center rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => onTabChange('single')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
            currentTab === 'single'
              ? 'bg-white text-blue-600 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          单个生成与美化
        </button>

        <button
          onClick={() => onTabChange('batch-generate')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
            currentTab === 'batch-generate'
              ? 'bg-white text-blue-600 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-4 w-4" />
          批量生成
        </button>

        <button
          onClick={() => onTabChange('batch-decode')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
            currentTab === 'batch-decode'
              ? 'bg-white text-blue-600 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ScanLine className="h-4 w-4" />
          批量解码识别
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600 hidden sm:inline-flex">
          <HelpCircle className="h-4 w-4" />
          <span>使用指南</span>
        </Button>
        <Button size="sm" className="gap-1.5 shadow-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
          <Sparkles className="h-4 w-4" />
          <span>永久无限制</span>
        </Button>
      </div>
    </header>
  );
};
