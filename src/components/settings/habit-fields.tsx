"use client";

// 做饭习惯的四个单选问题，欢迎页第一步与“我的 → 做饭习惯”共用。再点一次已选的项可以取消。
import { ToggleChip } from "@/components/toggle-chip";
import {
  HOUSEHOLD_LABELS,
  HOUSEHOLDS,
  SKILL_OPTIONS,
  SKILLS,
  SPICE_OPTIONS,
  SPICES,
  TIME_BUDGETS,
  TIME_LABELS,
  type Household,
  type Skill,
  type Spice,
  type TimeBudget,
} from "@/lib/preference-options";

export interface HabitsValue {
  skill: Skill | null;
  timeBudget: TimeBudget | null;
  spice: Spice | null;
  household: Household | null;
}

export const EMPTY_HABITS: HabitsValue = { skill: null, timeBudget: null, spice: null, household: null };

export function HabitFields({ value, onChange }: { value: HabitsValue; onChange: (v: HabitsValue) => void }) {
  const set = <K extends keyof HabitsValue>(key: K, v: HabitsValue[K]) =>
    onChange({ ...value, [key]: value[key] === v ? null : v });

  return (
    <div className="space-y-6">
      <Question title="做饭经验" sub="决定教程写多细">
        {SKILLS.map((s) => (
          <ToggleChip key={s} on={value.skill === s} onClick={() => set("skill", s)}>
            {SKILL_OPTIONS[s].label}
          </ToggleChip>
        ))}
      </Question>
      <Question title="平时做一顿饭花多久" sub="推荐时尽量不超过">
        {TIME_BUDGETS.map((t) => (
          <ToggleChip key={t} on={value.timeBudget === t} onClick={() => set("timeBudget", t)}>
            {TIME_LABELS[t]}
          </ToggleChip>
        ))}
      </Question>
      <Question title="能吃辣吗">
        {SPICES.map((s) => (
          <ToggleChip key={s} on={value.spice === s} onClick={() => set("spice", s)}>
            {SPICE_OPTIONS[s].label}
          </ToggleChip>
        ))}
      </Question>
      <Question title="一般几个人吃" sub="教程默认按这个份量写">
        {HOUSEHOLDS.map((h) => (
          <ToggleChip key={h} on={value.household === h} onClick={() => set("household", h)}>
            {HOUSEHOLD_LABELS[h]}
          </ToggleChip>
        ))}
      </Question>
    </div>
  );
}

function Question({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-small text-text-muted">{sub}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={title}>
        {children}
      </div>
    </div>
  );
}
