import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { discordConfigured, discordRedirectUri, discordSameOrigin } from "@/lib/discord-config";
import { discordHash, discordRateLimit, saveDiscordState } from "@/lib/discord-store";

export async function POST(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!discordSameOrigin(request)) return unauthorized("Invalid origin");
  if (!discordConfigured()) return NextResponse.json({ error: "La conexión con Discord todavía no está habilitada." }, { status: 503 });
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  if (!await discordRateLimit("oauth-global", 1000, 86400) || !await discordRateLimit(`oauth-user:${discordHash(session.sub)}`, 5, 3600) || !await discordRateLimit(`oauth-ip:${discordHash(ip)}`, 20, 3600)) {
    return NextResponse.json({ error: "Demasiados intentos. Probá más tarde." }, { status: 429 });
  }
  const state = randomBytes(32).toString("base64url");
  await saveDiscordState(state, session.sub);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID!, redirect_uri: discordRedirectUri(), response_type: "code", scope: "identify", state }).toString();
  const response = NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("barateam_discord_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/user/discord", maxAge: 600 });
  return response;
}
