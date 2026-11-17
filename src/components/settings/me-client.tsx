"use client";

// “我的”页上需要在浏览器里算的部分：额度恢复的本地时间、单位切换。
import { useEffect, useState } from "react";
import { resetTimeLabel } from "@/lib/draft";
import type { UnitSystem } from "@/lib/units";
import { putPreferences } from "./controls";

export function ResetTime({ at }: { at: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => setLabel(resetTimeLabel(at)), [at]);
  return <>每天 UTC 零点恢复{label ? `，即你这里的 ${label}` : ""}</>;
}

export function UnitsToggle({ initial }: { initial: UnitSystem }) {
  const [units, setUnits] = useState(initial);
  const [error, setError] = useState(false);
  const change = async (u: UnitSystem) => {
    const before = units;
    setUnits(u);
    setError(false);
    // 教程页上临时切换的单位只记在这台设备上，这里改的是账号默认值，以这里为准
    try {
      localStorage.removeItem("xz_units");
    } catch {}
    if (!(await putPreferences({ units: u }).catch(() => false))) {
      setUnits(before);
      setError(true);
    }
  };
  return (
    <div className="flex flex-col items-end">
      <div className="flex rounded-full bg-surface-muted p-0.5" role="group" aria-label="单位">
        {(
          [
            ["metric", "公制"],
            ["us", "美制"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={units === v}
            onClick={() => change(v)}
            className={`h-8 rounded-full px-3 text-small ${units === v ? "bg-surface font-bold shadow-sm" : "text-text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <span className="mt-1 text-caption text-danger">没保存上</span>}
    </div>
  );
}
