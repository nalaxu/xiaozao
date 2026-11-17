"use client";

import Link from "next/link";
import { useState } from "react";
import { ToggleChip } from "@/components/toggle-chip";
import { EQUIPMENT, LIMITS } from "@/lib/preference-options";
import { putPreferences, SaveStatus, Section, TagInput, useAutoSave, type SlimIngredient } from "./controls";

type Value = { equipment: string[]; pantry: string[] };

export function KitchenForm(props: {
  initial: Value;
  ingredients: SlimIngredient[];
  recording: { equipment: boolean; pantry: boolean };
}) {
  const [value, setValue] = useState(props.initial);
  const { queue, status } = useAutoSave<Value>((v) => putPreferences({ ...v }));
  const change = (v: Value) => {
    setValue(v);
    queue(v);
  };
  const off = (what: string) => (
    <span className="text-warning">
      “{what}”记录已关闭，这里的内容不会用于推荐。<Link href="/me/privacy" className="underline">去打开</Link>
    </span>
  );

  return (
    <>
      <Section title="厨具" sub={props.recording.equipment ? "只推荐你的厨具做得出来的菜。都不选表示不限。" : off("厨具")}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="厨具">
          {EQUIPMENT.map((e) => (
            <ToggleChip
              key={e}
              on={value.equipment.includes(e)}
              onClick={() =>
                change({
                  ...value,
                  equipment: value.equipment.includes(e) ? value.equipment.filter((x) => x !== e) : [...value.equipment, e],
                })
              }
            >
              {e}
            </ToggleChip>
          ))}
        </div>
      </Section>
      <Section title="常备调料" sub={props.recording.pantry ? "家里一直有的调料，推荐时不再算进“还需购买”。" : off("常备调料")}>
        <TagInput
          ingredients={props.ingredients}
          value={value.pantry}
          onChange={(pantry) => change({ ...value, pantry })}
          placeholder="例如生抽、蚝油、孜然"
          label="常备调料"
          max={LIMITS.pantry}
        />
      </Section>
      <div className="mt-4">
        <SaveStatus status={status} />
      </div>
    </>
  );
}
