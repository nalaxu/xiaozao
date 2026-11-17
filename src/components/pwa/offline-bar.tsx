"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { useRealPathname } from "@/lib/use-real-pathname";

// 断网时顶部细条提示（设计文档第 5 节）。烹饪模式里不显示任何网络提示（设计文档 4.6）
export function OfflineBar() {
  const pathname = useRealPathname();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline || /\/cook$/.test(pathname)) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-1.5 bg-text px-4 pb-1 pt-[calc(4px+env(safe-area-inset-top))] text-caption text-bg"
    >
      <CloudOff size={14} aria-hidden /> 离线中，收藏的教程仍可查看和烹饪
    </div>
  );
}
