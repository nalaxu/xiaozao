"use client";

// 首次登录欢迎页（设计文档 4.12）：忌口、过敏与厨具，保存或以后再说，然后回到原本要去的页面。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/form";
import { ToggleChip } from "@/components/toggle-chip";
import { EQUIPMENT } from "@/lib/preference-options";
import { putPreferences, type SlimIngredient } from "./controls";
import { RestrictionsFields, type RestrictionsValue } from "./restrictions-fields";

export function WelcomeForm(props: {
  next: string;
  initial: RestrictionsValue & { equipment: string[] };
  allergenOptions: { id: string; zh: string }[];
  ingredients: SlimIngredient[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<RestrictionsValue>({ allergens: props.initial.allergens, avoid: props.initial.avoid });
  const [equipment, setEquipment] = useState(props.initial.equipment);
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const [error, setError] = useState(false);

  const finish = async (save: boolean) => {
    setBusy(save ? "save" : "skip");
    setError(false);
    const ok = await putPreferences(save ? { ...value, equipment, onboarded: true } : { onboarded: true }).catch(() => false);
    if (!ok) {
      setBusy(null);
      setError(true);
      return;
    }
    router.replace(props.next);
  };

  return (
    <>
      <h1 className="font-serif text-display font-black">有什么不吃或过敏的吗？</h1>
      <p className="mt-2 text-text-muted">推荐和教程都会避开它们。以后可以在“我的”里随时改。</p>
      <div className="mt-6">
        <RestrictionsFields value={value} onChange={setValue} allergenOptions={props.allergenOptions} ingredients={props.ingredients} />
      </div>
      <div className="mt-6">
        <h2 className="font-bold">家里有哪些厨具？</h2>
        <p className="mt-0.5 text-small text-text-muted">只推荐做得出来的菜。可以不选。</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="厨具">
          {EQUIPMENT.map((e) => (
            <ToggleChip
              key={e}
              on={equipment.includes(e)}
              onClick={() => setEquipment((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]))}
            >
              {e}
            </ToggleChip>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-small text-danger">
          没保存上，请检查网络后再试一次。
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 pb-8">
        <Button onClick={() => finish(true)} loading={busy === "save"} disabled={busy !== null}>
          保存
        </Button>
        <Button variant="ghost" onClick={() => finish(false)} loading={busy === "skip"} disabled={busy !== null}>
          以后再说
        </Button>
      </div>
    </>
  );
}
