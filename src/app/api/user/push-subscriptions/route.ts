import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { deletePushSubscription, upsertPushSubscription } from "@/lib/push-subscription-store";

export async function POST(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const body = await request.json().catch(() => null);
  await upsertPushSubscription(session.sub, body?.subscription ?? {}, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  await deletePushSubscription(session.sub, endpoint);
  return NextResponse.json({ ok: true });
}
