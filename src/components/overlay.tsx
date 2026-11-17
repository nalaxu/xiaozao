"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** 固定在底部的主按钮；手机上位于标签栏之上 */
export function ActionBar({ children, aboveTabs = true }: { children: ReactNode; aboveTabs?: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 z-10 border-t border-border bg-bg/95 backdrop-blur lg:bottom-0 ${
        aboveTabs ? "bottom-[calc(64px+env(safe-area-inset-bottom))]" : "bottom-0 pb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <div className="mx-auto max-w-[640px] px-4 py-3 lg:max-w-[720px]">{children}</div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-[640px] overflow-y-auto rounded-t-sheet bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] lg:max-w-[480px] lg:rounded-sheet"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h2 font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="-mr-2 flex h-11 w-11 items-center justify-center text-text-muted">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

