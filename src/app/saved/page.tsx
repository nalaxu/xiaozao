import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "收藏" };

export default function SavedPage() {
  return <ComingSoon title="收藏" body="登录后，收藏的教程和做过的菜会出现在这里，收藏的教程离线也能看。" />;
}
