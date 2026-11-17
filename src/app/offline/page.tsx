import type { Metadata } from "next";
import { OfflineShell } from "@/components/pwa/offline-shell";
import { OFFLINE_SHELL_ID } from "@/lib/shell";

// 离线外壳：Service Worker 断网时用它代替任何页面，由它按地址从本机读出教程
export const dynamic = "force-static";
export const metadata: Metadata = { title: "离线", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div id={OFFLINE_SHELL_ID}>
      <OfflineShell />
    </div>
  );
}
