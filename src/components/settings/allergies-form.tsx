"use client";

import { useState } from "react";
import { putPreferences, SaveStatus, useAutoSave, type SlimIngredient } from "./controls";
import { RestrictionsFields, type RestrictionsValue } from "./restrictions-fields";

export function AllergiesForm(props: {
  initial: RestrictionsValue;
  allergenOptions: { id: string; zh: string }[];
  ingredients: SlimIngredient[];
}) {
  const [value, setValue] = useState(props.initial);
  const { queue, status } = useAutoSave<RestrictionsValue>((v) => putPreferences({ ...v }));
  return (
    <>
      <RestrictionsFields
        value={value}
        onChange={(v) => {
          setValue(v);
          queue(v);
        }}
        allergenOptions={props.allergenOptions}
        ingredients={props.ingredients}
      />
      <div className="mt-4">
        <SaveStatus status={status} />
      </div>
      <p className="mt-4 text-caption text-text-muted">
        过敏与忌口总是会用于推荐和教程，不受“数据与隐私”里的记录开关影响。检查按关键词进行，宁可多避开；教程仍由 AI 生成，请自行确认。
      </p>
    </>
  );
}
