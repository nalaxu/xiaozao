"use client";

import Link from "next/link";
import { useState } from "react";
import { putPreferences, SaveStatus, useAutoSave } from "./controls";
import { HabitFields, type HabitsValue } from "./habit-fields";

export function HabitsForm(props: { initial: HabitsValue; recording: boolean }) {
  const [value, setValue] = useState(props.initial);
  const { queue, status } = useAutoSave<HabitsValue>((v) => putPreferences({ ...v }));

  return (
    <>
      <p className="mb-6 text-small text-text-muted">
        {props.recording ? (
          "推荐选菜和教程写法都会参考这些。再点一次已选的可以取消。"
        ) : (
          <span className="text-warning">
            “口味偏好”记录已关闭，这里的内容不会用于推荐。<Link href="/me/privacy" className="underline">去打开</Link>
          </span>
        )}
      </p>
      <HabitFields
        value={value}
        onChange={(v) => {
          setValue(v);
          queue(v);
        }}
      />
      <div className="mt-6">
        <SaveStatus status={status} />
      </div>
    </>
  );
}
