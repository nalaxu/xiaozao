import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShredLab } from "@/components/lab/shred-lab";

// 教学动画原型（docs/xiaozao-3d-interaction-plan.md 第 5、7 节）。不在导航里出现、不被收录；
// 线上默认 404，设置 ENABLE_3D_LAB=1 后可访问，便于在真机上试看。
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "土豆切丝 · 动画原型", robots: { index: false, follow: false } };

export default function ShredLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_3D_LAB !== "1") notFound();
  return (
    <div>
      <p className="text-small text-text-muted">动画原型 · 仅供试看</p>
      <h1 className="mt-1 font-serif text-[24px] font-bold">土豆切丝</h1>
      <p className="mt-1 text-small text-text-muted">切片 → 码片 → 切丝。可以拖动进度条、跳到某一段或慢放。</p>
      <div className="mt-4">
        <ShredLab />
      </div>
      <section className="mt-5 space-y-2 rounded-card border border-border p-3 text-small">
        <p>
          <span className="font-bold">护住手指：</span>
          按住土豆的手指弯成爪状，指尖往里收，用指关节抵住刀面；刀每次往后挪一点，手跟着往后退。
        </p>
        <p className="text-text-muted">动画只示意动作顺序和切好的样子，标注的是目标尺寸，不要拿屏幕上的长度当尺子。</p>
      </section>
    </div>
  );
}
