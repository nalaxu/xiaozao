import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "我的" };

export default function MePage() {
  return <ComingSoon title="我的" body="登录后可以设置忌口与过敏、厨具和常备调料，查看今日额度和管理个人数据。" />;
}
