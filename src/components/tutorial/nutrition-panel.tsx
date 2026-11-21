"use client";

// 教程里的营养：模型按每样食材的实际用量逐项估，这里汇总、按人数平分成一人份。
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  NUTRIENTS,
  NUTRIENT_META,
  formatNutrient,
  nrvPercent,
  sumNutrition,
  type IngredientNutrition,
} from "@/lib/nutrition";

export function NutritionPanel({ items, servings }: { items: IngredientNutrition[]; servings: number }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const { total, perServing } = sumNutrition(items, servings);
  const sorted = [...items].sort((a, b) => b.kcal - a.kcal);

  return (
    <section className="mt-8" aria-labelledby="nutrition-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="nutrition-title" className="font-serif text-h1 font-black">
          营养
        </h2>
        <span className="text-small text-text-muted">每人份{servings > 1 ? `（整道菜 ${servings} 人平分）` : ""}</span>
      </div>

      <div className="rounded-[18px] border border-border bg-surface px-4 pb-3 pt-3.5">
        <p className="flex items-baseline gap-1.5">
          <span className="tabular font-serif text-[32px] font-black leading-[38px]">
            {formatNutrient("kcal", perServing.kcal)}
          </span>
          <span className="text-small text-text-muted">kcal</span>
          <span className="ml-auto text-small text-text-muted">占每日参考 {nrvPercent("kcal", perServing.kcal)}%</span>
        </p>
        <dl className="mt-3 divide-y divide-dashed divide-border">
          {NUTRIENTS.filter((k) => k !== "kcal").map((k) => {
            const pct = nrvPercent(k, perServing[k]);
            return (
              <div key={k} className="flex items-center gap-3 py-2">
                <dt className="w-[68px] shrink-0">{NUTRIENT_META[k].label}</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${pct > 50 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </span>
                  <span className="tabular w-[72px] shrink-0 text-right font-bold">
                    {formatNutrient(k, perServing[k])} {NUTRIENT_META[k].unit}
                  </span>
                  <span className="tabular w-[40px] shrink-0 text-right text-small text-text-muted">{pct}%</span>
                </dd>
              </div>
            );
          })}
        </dl>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 flex h-10 w-full items-center justify-between text-small font-bold text-primary"
        >
          按食材看（整道菜 {formatNutrient("kcal", total.kcal)} kcal）
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {open && (
          <table className="mb-1 w-full text-caption">
            <thead className="text-caption text-text-muted">
              <tr className="text-right">
                <th className="py-1 text-left font-normal">食材</th>
                <th className="py-1 font-normal">用量</th>
                <th className="py-1 font-normal">热量</th>
                <th className="py-1 font-normal">蛋白</th>
                <th className="py-1 font-normal">脂肪</th>
                <th className="py-1 font-normal">碳水</th>
                <th className="py-1 font-normal">钠 mg</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-dashed divide-border">
              {sorted.map((i, idx) => (
                <tr key={`${i.name_zh}-${idx}`} className="text-right">
                  <td className="max-w-[84px] truncate py-1.5 text-left">{i.name_zh}</td>
                  <td className="py-1.5 text-text-muted">{Math.round(i.grams)} g</td>
                  <td className="py-1.5">{formatNutrient("kcal", i.kcal)}</td>
                  <td className="py-1.5">{formatNutrient("protein_g", i.protein_g)}</td>
                  <td className="py-1.5">{formatNutrient("fat_g", i.fat_g)}</td>
                  <td className="py-1.5">{formatNutrient("carbs_g", i.carbs_g)}</td>
                  <td className="py-1.5">{formatNutrient("sodium_mg", i.sodium_mg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-caption text-text-muted">
        按上面的用量逐项估算，参考常见食物成分表；炒菜的油按留在菜里的量算。实际会随食材品种、吸油多少浮动。每日参考值按成人
        2000 kcal 计。
      </p>
    </section>
  );
}
