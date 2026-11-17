"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, postJson } from "@/components/form";

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
        router.replace("/");
        router.refresh();
      }}
    >
      退出登录
    </Button>
  );
}
