import type { MetadataRoute } from "next";

// 可添加到主屏幕（PRD 第 8 节）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "小灶",
    short_name: "小灶",
    description: "告诉它你想吃什么味道、手头有什么，它帮你挑几道菜，再带你做出来。",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#fbf8f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
