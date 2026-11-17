import { cuisineColor } from "@/components/ui";
import { getCuisine, kb } from "@/lib/kb";

export function cuisineMeta(id: string): { zh: string; color: string } | undefined {
  const c = getCuisine(id);
  if (!c) return undefined;
  const inGroup = kb.cuisines.filter((x) => x.group === c.group);
  return { zh: c.name.zh, color: cuisineColor(c.group, inGroup.indexOf(c)) };
}
