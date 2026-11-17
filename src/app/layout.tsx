import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import { OfflineBar } from "@/components/pwa/offline-bar";
import { ServiceWorker } from "@/components/pwa/service-worker";
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
    { media: "(prefers-color-scheme: light)", color: "#fbf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#161412" },
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
