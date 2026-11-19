"use client";

// 首次登录欢迎页（设计文档 4.12），两步：
// 1. 做饭习惯（经验、时间、吃辣、人数）；“以后再说”保存已选的，跳过后面。
// 2. 忌口、过敏与厨具；“跳过这一步”只保存第一步的回答。
// 完成后回到原本要去的页面。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/form";
import { ToggleChip } from "@/components/toggle-chip";
import { EQUIPMENT } from "@/lib/preference-options";
import { putPreferences, type SlimIngredient } from "./controls";
import { HabitFields, type HabitsValue } from "./habit-fields";
import { RestrictionsFields, type RestrictionsValue } from "./restrictions-fields";

type Busy = "next" | "skip" | "save" | null;

export function WelcomeForm(props: {
  next: string;
  initial: RestrictionsValue & { equipment: string[]; habits: HabitsValue };
  allergenOptions: { id: string; zh: string }[];
  ingredients: SlimIngredient[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [habits, setHabits] = useState<HabitsValue>(props.initial.habits);
  const [value, setValue] = useState<RestrictionsValue>({ allergens: props.initial.allergens, avoid: props.initial.avoid });
  const [equipment, setEquipment] = useState(props.initial.equipment);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState(false);

  const finish = async (kind: Exclude<Busy, null | "next">, patch: Record<string, unknown>) => {
    setBusy(kind);
    setError(false);
    const ok = await putPreferences({ ...patch, onboarded: true }).catch(() => false);
    if (!ok) {
      setBusy(null);
      setError(true);
      return;
    }
    router.replace(props.next);
  };

  const go = (s: 1 | 2) => {
    setStep(s);
    setError(false);
    window.scrollTo(0, 0);
  };

  const errorLine = error && (
    <p role="alert" className="mt-4 text-small text-danger">
      没保存上，请检查网络后再试一次。
    </p>
  );

  if (step === 1) {
    return (
      <>
        <p className="text-small font-bold text-primary">1 / 2</p>
        <h1 className="mt-1 font-serif text-display font-black">先简单了解一下你</h1>
        <p className="mt-2 text-text-muted">推荐什么菜、教程写多细，都会照这个来。都可以不选，以后在“我的 → 做饭习惯”里随时改。</p>
        <div className="mt-6">
          <HabitFields value={habits} onChange={setHabits} />
        </div>
        {errorLine}
        <div className="mt-8 flex flex-col gap-3 pb-8">
          <Button onClick={() => go(2)} disabled={busy !== null}>
            下一步
          </Button>
          <Button variant="ghost" onClick={() => finish("skip", { ...habits })} loading={busy === "skip"} disabled={busy !== null}>
            以后再说
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={busy !== null}
        className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-text-muted"
      >
        <ChevronLeft size={18} aria-hidden /> 上一步
      </button>
      <p className="text-small font-bold text-primary">2 / 2</p>
      <h1 className="mt-1 font-serif text-display font-black">有什么不吃或过敏的吗？</h1>
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
      {errorLine}
      <div className="mt-8 flex flex-col gap-3 pb-8">
        <Button onClick={() => finish("save", { ...habits, ...value, equipment })} loading={busy === "save"} disabled={busy !== null}>
          完成
        </Button>
        <Button variant="ghost" onClick={() => finish("skip", { ...habits })} loading={busy === "skip"} disabled={busy !== null}>
          跳过这一步
        </Button>
      </div>
    </>
  );
}
