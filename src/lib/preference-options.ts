// 设置页的固定选项（设计文档 4.10）。前后端共用。
export const EQUIPMENT = ["烤箱", "空气炸锅", "电饭煲", "高压锅", "明火灶", "电炉/电磁炉", "微波炉", "搅拌机"] as const;

export const PRIVACY_KEYS = ["recordTaste", "recordHistory", "recordRatings", "recordEquipment", "recordPantry"] as const;
export type PrivacyKey = (typeof PRIVACY_KEYS)[number];

export const PRIVACY_LABELS: Record<PrivacyKey, { title: string; desc: string }> = {
  recordTaste: { title: "口味偏好", desc: "你写的口味描述、做饭习惯（经验、时间、吃辣、人数）和上次选的味型、场景" },
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

// ─── 做饭习惯（欢迎页第一步与“我的 → 做饭习惯”）────────────────
// 都是单选、可不选。label 给用户看，prompt 交给模型；guidance 是对应的写法要求。

export const SKILLS = ["beginner", "home", "regular", "seasoned"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_OPTIONS: Record<Skill, { label: string; prompt: string; recommend: string; tutorial: string }> = {
  beginner: {
    label: "刚开始学",
    prompt: "刚开始学做饭",
    recommend: "多推荐难度 1–2、步骤少、不太考验火候和刀工的菜",
    tutorial:
      "步骤拆细；第一次出现的术语（如焯水、勾芡、爆香）在步骤里用一句话解释；刀工写清大小（如切 1 厘米见方的丁）；火候和 cue 写得更具体，多提醒容易出错的地方",
  },
  home: {
    label: "会做几道家常菜",
    prompt: "会做几道家常菜",
    recommend: "难度 1–2 为主，可以有少量难度 3",
    tutorial: "常见做法不用解释，不常见的技法简单说明一句",
  },
  regular: {
    label: "经常下厨",
    prompt: "经常下厨",
    recommend: "难度不限",
    tutorial: "写得简洁，常规操作不用解释，重点放在这道菜特有的地方",
  },
  seasoned: {
    label: "很有经验",
    prompt: "做饭很有经验",
    recommend: "难度不限，可以推荐更讲究的菜",
    tutorial: "写得精炼，常规操作一笔带过，可以在 key_points 里提一句进阶做法或讲究",
  },
};

export const TIME_BUDGETS = [15, 30, 60, 0] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];
/** 0 表示不赶时间 */
export const TIME_LABELS: Record<TimeBudget, string> = { 15: "15 分钟内", 30: "半小时左右", 60: "一小时左右", 0: "不赶时间" };

export const SPICES = ["none", "mild", "medium", "hot"] as const;
export type Spice = (typeof SPICES)[number];
export const SPICE_OPTIONS: Record<Spice, { label: string; recommend: string; tutorial: string }> = {
  none: {
    label: "不吃辣",
    recommend: "少推荐以辣为主的菜",
    tutorial: "不用辣椒和含辣椒的调料；这道菜本来靠辣的，改成不辣的做法，并说明风味有什么不同",
  },
  mild: {
    label: "微辣",
    recommend: "以辣为主的菜要能做成微辣",
    tutorial: "辣椒按常规用量的一半左右，写明喜欢辣的怎么加",
  },
  medium: { label: "中辣", recommend: "辣度按菜本来的样子", tutorial: "辣度按这道菜常规的做法" },
  hot: { label: "越辣越好", recommend: "可以多推荐辣的菜", tutorial: "可以比常规更辣，写明怎么加辣" },
};

/** 平时几个人吃：教程默认份量。6 表示 5 人以上 */
export const HOUSEHOLDS = [1, 2, 3, 4, 6] as const;
export type Household = (typeof HOUSEHOLDS)[number];
export const HOUSEHOLD_LABELS: Record<Household, string> = { 1: "1 人", 2: "2 人", 3: "3 人", 4: "4 人", 6: "5 人以上" };
