import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/user-store";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  return NextResponse.json({ settings: await getNotificationSettings(session.sub) });
}

export async function PUT(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const body = await request.json().catch(() => null);
  return NextResponse.json({
    settings: await updateNotificationSettings(session.sub, body?.settings ?? {})
  });
}
