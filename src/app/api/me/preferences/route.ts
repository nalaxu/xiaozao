import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/api-user";
import { jsonError, readJson } from "@/server/http";
import { loadPersonalization } from "@/server/preferences";
import { preferencesPatch, savePreferences } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await apiUser(req, { write: false });
  if ("error" in g) return g.error;
  const { prefs, privacy } = await loadPersonalization(g.db, g.user.id);
  return NextResponse.json({ preferences: prefs, privacy });
}

export async function PUT(req: NextRequest) {
  const g = await apiUser(req, { write: true });
  if ("error" in g) return g.error;
  const parsed = preferencesPatch.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "内容不符合要求", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
  await savePreferences(g.db, g.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
