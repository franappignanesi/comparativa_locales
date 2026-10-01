import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { discordSameOrigin, discordSendsEnabled } from "@/lib/discord-config";
import { discordHash, discordRateLimit, getDiscordLink, verifyDiscordLink } from "@/lib/discord-store";
import { sendDiscordDm } from "@/lib/discord-api";

export async function POST(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!discordSameOrigin(request)) return unauthorized("Invalid origin");
  if (!discordSendsEnabled()) return NextResponse.json({ error: "Los envíos de Discord están pausados." }, { status: 503 });
  if (!await discordRateLimit(`test:${discordHash(session.sub)}`, 2, 86400)) return NextResponse.json({ error: "Ya alcanzaste el límite de pruebas de hoy." }, { status: 429 });
  const link = await getDiscordLink(session.sub);
  if (!link) return NextResponse.json({ error: "Primero conectá tu cuenta de Discord." }, { status: 400 });
  if (!await discordRateLimit(`test-recipient:${discordHash(link.discordId)}`, 2, 86400)) return NextResponse.json({ error: "Esta cuenta de Discord ya alcanzó el límite de pruebas de hoy." }, { status: 429 });
  try {
    await sendDiscordDm(link.discordId, { content: "¡Conexión con BARATEAM confirmada! Podés activar las alertas de tu lista de deseados desde https://www.shuxteam.com/perfil. Podés desactivarlas allí en cualquier momento." }, randomUUID().replaceAll("-", ""));
    await verifyDiscordLink(session.sub, link.discordId);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "No pudimos confirmar el mensaje. Revisá tus permisos de MD, que estés en el servidor de SHUX, o intentá más tarde. Si llegó, no repitas la prueba inmediatamente." }, { status: 502 }); }
}
