"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { OFFLINE_SHELL_ID } from "./shell";


const noop = () => () => {};

/**
 * 当前地址，供标签栏等布局组件判断显示与否。
 * 断网时 Service Worker 用预渲染的离线外壳 /offline 代替任何页面，路由报告的却是真实地址；
 * 水合时必须与预渲染的 HTML 一致（按 /offline 渲染），水合完成后再换成真实地址。
 */
export function useRealPathname() {
  const pathname = usePathname();
  const hydrating = useSyncExternalStore(
    noop,
    () => false,
    () => true,
  );
  if (hydrating && typeof document !== "undefined" && document.getElementById(OFFLINE_SHELL_ID)) return "/offline";
  return pathname;
}
