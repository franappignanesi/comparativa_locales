import { boundedDiscordSetting, discordRecipientAllowed, discordSendsEnabled } from "./discord-config";
import { discordControlEnabled, discordRateLimit } from "./discord-store";

export class DiscordApiError extends Error {
  constructor(public status: number, public retryAfter = 0, public ambiguous = false) { super(`Discord request failed (${status})`); }
}
let requests = 0;
let stopped = false;
export function resetDiscordBudget() { requests = 0; stopped = false; }
export async function discordRequest(path: string, body?: unknown): Promise<Record<string, any>> {
  if (!discordSendsEnabled() || stopped) throw new DiscordApiError(503);
  if (++requests > boundedDiscordSetting("DISCORD_MAX_REQUESTS", 250, 1000)) { stopped = true; throw new DiscordApiError(429, 3600); }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new DiscordApiError(503);
  let response: Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000), cache: "no-store"
    });
  } catch { throw new DiscordApiError(0, 0, true); }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 429) stopped = true;
  if (!response.ok) throw new DiscordApiError(response.status, Math.min(86400, Math.max(1, Number(data.retry_after) || 60)), response.status >= 500);
  return data;
}
export async function sendDiscordDm(recipient: string, payload: { content?: string; embeds?: Array<Record<string, unknown>> }, nonce: string) {
  if (!/^\d{17,22}$/.test(recipient) || !discordRecipientAllowed(recipient)) throw new DiscordApiError(403);
  if (!discordSendsEnabled() || !await discordControlEnabled()) throw new DiscordApiError(503);
  if (!await discordRateLimit("send-global", boundedDiscordSetting("DISCORD_DAILY_SEND_LIMIT", 100, 1000), 86400)) throw new DiscordApiError(429, 3600);
  const dm = await discordRequest("/users/@me/channels", { recipient_id: recipient });
  if (!/^\d{17,22}$/.test(String(dm.id))) throw new DiscordApiError(502);
  return discordRequest(`/channels/${dm.id}/messages`, { ...payload, nonce: nonce.slice(0, 25), enforce_nonce: true, allowed_mentions: { parse: [] } });
}
export async function sendDiscordWebhook(payload: { content?: string; embeds?: Array<Record<string, unknown>> }) {
  if (!discordSendsEnabled() || !await discordControlEnabled()) throw new DiscordApiError(503);
  const url = process.env.DISCORD_WEEKLY_WEBHOOK_URL;
  if (!url || !/^https:\/\/discord\.com\/api(?:\/v10)?\/webhooks\/\d{17,22}\/[A-Za-z0-9_-]+$/.test(url)) throw new DiscordApiError(503);
  if (!await discordRateLimit("weekly-global", 2, 86400)) throw new DiscordApiError(429, 3600);
  let response: Response;
  try { response = await fetch(`${url}?wait=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(12000) }); }
  catch { throw new DiscordApiError(0, 0, true); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new DiscordApiError(response.status, Math.min(86400, Math.max(1, Number(data.retry_after) || 60)), response.status >= 500);
}
