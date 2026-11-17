"use client";

// 菜品图：没有图时显示菜系配色占位，生成好后淡入替换（PRD 4.3、设计文档 4.4）。
import { useState } from "react";
import { CuisinePlaceholder } from "@/components/ui";

export function DishImage({
  url,
  color,
  label,
  className = "",
  caption = "AI 示意图",
}: {
  url: string | null;
  color?: string;
  label: string;
  className?: string;
  caption?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <CuisinePlaceholder color={color ?? "var(--surface-muted)"} label={label} className="absolute inset-0" />
      {url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 图片已按尺寸生成 WebP，不经 Next 图片优化 */}
          <img
            src={url}
            alt=""
            onLoad={() => setLoaded(true)}
            // 服务端渲染的图可能在水合前就加载完，onLoad 不会再触发
            ref={(el) => {
              if (el?.complete && el.naturalWidth) setLoaded(true);
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
          {loaded && caption && (
            <span className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 text-caption text-white">{caption}</span>
          )}
        </>
      )}
    </div>
  );
}
