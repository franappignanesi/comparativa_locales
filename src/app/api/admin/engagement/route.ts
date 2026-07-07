import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { getEngagementSummary } from "@/lib/engagement-store";

export async function GET(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json(await getEngagementSummary(30));
}
