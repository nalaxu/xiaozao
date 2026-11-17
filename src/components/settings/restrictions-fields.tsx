"use client";

// 忌口与过敏的输入：过敏原多选标签 + 忌口食材输入（设计文档 4.10、4.12）
import { ToggleChip } from "@/components/toggle-chip";
import { LIMITS } from "@/lib/preference-options";
import { TagInput, type SlimIngredient } from "./controls";

export interface RestrictionsValue {
  allergens: string[];
  avoid: string[];
}

export function RestrictionsFields({
  value,
  onChange,
  allergenOptions,
  ingredients,
}: {
  value: RestrictionsValue;
  onChange: (v: RestrictionsValue) => void;
  allergenOptions: { id: string; zh: string }[];
  ingredients: SlimIngredient[];
}) {
  const toggle = (id: string) =>
    onChange({
      ...value,
      allergens: value.allergens.includes(id) ? value.allergens.filter((a) => a !== id) : [...value.allergens, id],
    });
  return (
    <>
      <div>
        <h2 className="font-bold">过敏</h2>
        <p className="mt-0.5 text-small text-text-muted">选中后，含这类成分的菜和调料都不会出现（例如甲壳类会连蚝油、虾酱一起避开）。</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="过敏原">
          {allergenOptions.map((a) => (
            <ToggleChip key={a.id} on={value.allergens.includes(a.id)} onClick={() => toggle(a.id)}>
              {a.zh}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="font-bold">不吃的东西</h2>
        <p className="mt-0.5 mb-3 text-small text-text-muted">例如香菜、羊肉、内脏。中英文都行。</p>
        <TagInput
          ingredients={ingredients}
          value={value.avoid}
          onChange={(avoid) => onChange({ ...value, avoid })}
          placeholder="输入不吃的食材"
          label="不吃的东西"
          max={LIMITS.avoid}
        />
      </div>
    </>
  );
}
