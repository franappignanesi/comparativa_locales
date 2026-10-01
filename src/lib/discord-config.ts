export const DISCORD_SITE = "https://www.shuxteam.com";
export function discordConfigured() {
  return process.env.DISCORD_CONNECT_ENABLED === "1" && Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_BOT_TOKEN);
}
export function discordSendsEnabled() { return process.env.DISCORD_SEND_ENABLED === "1"; }
export function discordWebhookUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(url.hostname) || url.port || url.username || url.password || url.hash) return null;
    if (!/^\/api(?:\/v10)?\/webhooks\/\d{17,22}\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some((key) => key !== "wait")) return null;
    url.searchParams.set("wait", "true");
    return url;
  } catch { return null; }
}
export function discordRecipientAllowed(id: string) {
  return process.env.DISCORD_TEST_MODE !== "0" ? (process.env.DISCORD_TEST_USER_IDS ?? "").split(",").map((value) => value.trim()).includes(id) : true;
}
export function boundedDiscordSetting(name: string, fallback: number, ceiling: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), ceiling) : fallback;
}
export function discordRedirectUri() { return `${DISCORD_SITE}/api/user/discord/callback`; }
export function discordSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === DISCORD_SITE || (process.env.NODE_ENV !== "production" && origin === new URL(request.url).origin);
}
