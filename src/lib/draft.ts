// 首页的选择存在 localStorage（技术方案 6.3）：未登录时选好的东西登录后带过去，
// 从推荐页点“修改”回到首页时也能保留。

export interface DraftItem {
  name: string;
  /** 主料（实心）或“手头还有”（描边） */
  main: boolean;
  /** 是否在食材词典里；词典外的显示为虚线标签 */
  known: boolean;
}

export interface Draft {
  items: DraftItem[];
  flavors: string[];
  scene: string | null;
  cuisine: string | null;
}

const KEY = "xz_draft";

export const emptyDraft = (): Draft => ({ items: [], flavors: [], scene: null, cuisine: null });

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      items: Array.isArray(d.items) ? d.items.filter((i) => typeof i?.name === "string").slice(0, 30) : [],
      flavors: Array.isArray(d.flavors) ? d.flavors.slice(0, 3) : [],
      scene: typeof d.scene === "string" ? d.scene : null,
      cuisine: typeof d.cuisine === "string" ? d.cuisine : null,
    };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // 隐私模式等情况下无法保存，不影响当前页面
  }
}

/** 额度恢复时间，用用户本地时间显示，如“8 点”“8:30” */
export function resetTimeLabel(iso: string): string {
  const d = new Date(iso);
  const m = d.getMinutes();
  return m ? `${d.getHours()}:${String(m).padStart(2, "0")}` : `${d.getHours()} 点`;
}
