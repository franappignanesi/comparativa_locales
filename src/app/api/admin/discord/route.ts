import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { isAdminEmail } from "@/lib/admin";
import { discordSameOrigin, discordSendsEnabled } from "@/lib/discord-config";
import { discordControlEnabled, setDiscordControl } from "@/lib/discord-store";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email)) return unauthorized("Forbidden");
  return NextResponse.json({ enabled: await discordControlEnabled(), configuredToSend: discordSendsEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email) || !discordSameOrigin(request)) return unauthorized("Forbidden");
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Invalid enabled flag" }, { status: 400 });
  await setDiscordControl(body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
