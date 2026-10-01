import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { discordConfigured, discordSameOrigin } from "@/lib/discord-config";
import { discordHash, discordRateLimit, getDiscordLink, unlinkDiscord } from "@/lib/discord-store";
import { updateNotificationSettings } from "@/lib/user-store";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  try {
    const link = await getDiscordLink(session.sub);
    return NextResponse.json({ available: discordConfigured(), connected: Boolean(link), username: link?.username, verified: link?.verified ?? false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ available: false, connected: false, verified: false }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!discordSameOrigin(request)) return unauthorized("Invalid origin");
  if (!await discordRateLimit(`unlink:${discordHash(session.sub)}`, 10, 3600)) return NextResponse.json({ error: "Esperá unos minutos antes de volver a intentarlo." }, { status: 429 });
  await updateNotificationSettings(session.sub, { discord: false });
  await unlinkDiscord(session.sub);
  return NextResponse.json({ ok: true });
}
