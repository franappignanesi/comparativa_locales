import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { discordConfigured, discordRedirectUri, DISCORD_SITE } from "@/lib/discord-config";
import { consumeDiscordState, linkDiscord } from "@/lib/discord-store";
import { updateNotificationSettings } from "@/lib/user-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("barateam_discord_state="))?.split("=")[1] ?? "";
  const session = getCurrentUser(request);
  let result = "error";
  try {
    if (!session || !discordConfigured() || state.length !== 43 || state.length !== cookie.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) || !await consumeDiscordState(state, session.sub)) throw new Error("Invalid OAuth state");
    const code = url.searchParams.get("code");
    if (!code || code.length > 300 || url.searchParams.has("error")) throw new Error("Authorization declined");
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID!, client_secret: process.env.DISCORD_CLIENT_SECRET!, grant_type: "authorization_code", code, redirect_uri: discordRedirectUri() }),
      signal: AbortSignal.timeout(10000), cache: "no-store"
    });
    if (!tokenResponse.ok) throw new Error("Authorization failed");
    const token = await tokenResponse.json();
    if (typeof token.access_token !== "string" || token.token_type?.toLowerCase() !== "bearer") throw new Error("Invalid token");
    const identityResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!identityResponse.ok) throw new Error("Identity unavailable");
    const identity = await identityResponse.json();
    if (!/^\d{17,22}$/.test(identity.id) || identity.bot || typeof identity.username !== "string") throw new Error("Invalid identity");
    // Retain only the verified identity, never OAuth access/refresh tokens.
    await updateNotificationSettings(session.sub, { discord: false });
    await linkDiscord(session.sub, identity.id, identity.username);
    result = "connected";
  } catch { /* Never expose OAuth credentials or provider responses. */ }
  const response = NextResponse.redirect(`${DISCORD_SITE}/perfil?discord=${result}#notificaciones`);
  response.cookies.set("barateam_discord_state", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/user/discord", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
