import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
  });
}
