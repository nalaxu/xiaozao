"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, postJson } from "@/components/form";
import { clearOffline } from "@/lib/offline";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await postJson("/api/auth/logout", {});
        // 本机保存的教程属于这个账号，退出时一并清掉
        await clearOffline();
        router.replace("/");
        router.refresh();
      }}
    >
      退出登录
    </Button>
  );
}
