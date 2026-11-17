// 设置页的固定选项（设计文档 4.10）。前后端共用。
export const EQUIPMENT = ["烤箱", "空气炸锅", "电饭煲", "高压锅", "明火灶", "电炉/电磁炉", "微波炉", "搅拌机"] as const;

export const PRIVACY_KEYS = ["recordTaste", "recordHistory", "recordRatings", "recordEquipment", "recordPantry"] as const;
export type PrivacyKey = (typeof PRIVACY_KEYS)[number];

export const PRIVACY_LABELS: Record<PrivacyKey, { title: string; desc: string }> = {
  recordTaste: { title: "口味偏好", desc: "你写的口味描述和上次选的味型、场景" },
  recordHistory: { title: "历史", desc: "生成过的教程；用来避免重复推荐。收藏不受影响" },
  recordRatings: { title: "评价", desc: "做完后的评价；好评和“不会再做”会影响推荐" },
  recordEquipment: { title: "厨具", desc: "只推荐你的厨具做得出来的菜" },
  recordPantry: { title: "常备调料", desc: "减少“还需购买”的东西" },
};

export const VERDICTS = ["good", "ok", "never"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABELS: Record<Verdict, { emoji: string; label: string }> = {
  good: { emoji: "😋", label: "好吃" },
  ok: { emoji: "🙂", label: "一般" },
  never: { emoji: "🙅", label: "不会再做" },
};

export const LIMITS = { avoid: 30, pantry: 40, term: 30, tasteNotes: 300, reason: 200 } as const;
