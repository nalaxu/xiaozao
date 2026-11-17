import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/server/auth/current";
import { forbiddenOrigin, sameOrigin } from "@/server/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  await signOut();
  return NextResponse.json({ next: "/" });
}
