import { redirect } from "next/navigation";

// 花费页（F38）在 M6 实现，届时作为后台首页
export default function AdminHome() {
  redirect("/admin/invites");
}
