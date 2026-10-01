import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/user-store";
import { discordSameOrigin } from "@/lib/discord-config";
import { getDiscordLink } from "@/lib/discord-store";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  return NextResponse.json({ settings: await getNotificationSettings(session.sub) });
}

export async function PUT(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!discordSameOrigin(request)) return unauthorized("Invalid origin");
  const body = await request.json().catch(() => null);
  if (body?.settings?.discord !== undefined && typeof body.settings.discord !== "boolean") return NextResponse.json({ error: "Invalid Discord preference" }, { status: 400 });
  if (body?.settings?.discord === true && !(await getDiscordLink(session.sub))?.verified) {
    return NextResponse.json({ error: "Conectá Discord y confirmá el mensaje de prueba antes de activar alertas." }, { status: 400 });
  }
  return NextResponse.json({
    settings: await updateNotificationSettings(session.sub, body?.settings ?? {})
  });
}
