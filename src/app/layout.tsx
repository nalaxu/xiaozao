import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import { OfflineBar } from "@/components/pwa/offline-bar";
import { ServiceWorker } from "@/components/pwa/service-worker";
// 手写点缀字体随站点自托管，按字形分片（unicode-range），只下载页面用到的片段（设计文档 6.3）
import "@fontsource/ma-shan-zheng/chinese-simplified-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "小灶", template: "%s · 小灶" },
  description: "告诉它你想吃什么味道、手头有什么，它帮你挑几道菜，再带你做出来。",
  applicationName: "小灶",
  appleWebApp: { capable: true, title: "小灶", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f0e4" },
    { media: "(prefers-color-scheme: dark)", color: "#17110d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        <OfflineBar />
        <AppNav />
        <main className="mx-auto w-full max-w-[640px] px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-4 lg:max-w-[720px] lg:pb-16 lg:pt-8">
          {children}
        </main>
        <ServiceWorker />
      </body>
    </html>
  );
}
