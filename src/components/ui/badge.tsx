import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "border-transparent bg-blue-600 text-white": variant === "default",
          "border-transparent bg-slate-100 text-slate-800": variant === "secondary",
          "border-slate-200 text-slate-700": variant === "outline",
          "border-emerald-200 bg-emerald-50 text-emerald-700": variant === "success",
          "border-amber-200 bg-amber-50 text-amber-700": variant === "warning",
        },
        className
      )}
      {...props}
    />
  );
}
