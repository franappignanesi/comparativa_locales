import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | undefined;
let schema: Promise<void> | undefined;
function sql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Discord requires Postgres");
  return client ??= neon(url);
}
export function discordHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function rows(query: string, params: unknown[] = []) {
  return await sql().query(query, params, { arrayMode: false, fullResults: false }) as Array<Record<string, unknown>>;
}
async function ready() {
  schema ??= (async () => {
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_links (
      user_sub VARCHAR(191) PRIMARY KEY, discord_id VARCHAR(32) UNIQUE NOT NULL,
      username VARCHAR(100) NOT NULL, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_oauth_states (
      state_hash VARCHAR(64) PRIMARY KEY, user_sub VARCHAR(191) NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`);
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_rate_limits (
      key VARCHAR(150) PRIMARY KEY, count INT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`);
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_outbox (
      id VARCHAR(64) PRIMARY KEY, kind VARCHAR(16) NOT NULL, user_sub VARCHAR(191) NOT NULL,
      recipient VARCHAR(32) NOT NULL, payload JSONB NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0, next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), owner UUID,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ)`);
    await sql().query("ALTER TABLE discord_outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ");
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_weekly_bargains (
      game_id VARCHAR(191) PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL)`);
    await sql().query(`CREATE TABLE IF NOT EXISTS discord_alert_receipts (
      user_sub VARCHAR(191) NOT NULL, signature VARCHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_sub, signature))`);
    await sql().query("CREATE TABLE IF NOT EXISTS discord_controls (id INT PRIMARY KEY, enabled BOOLEAN NOT NULL)");
    await sql().query("INSERT INTO discord_controls (id,enabled) VALUES (1,TRUE) ON CONFLICT DO NOTHING");
  })().catch((error) => { schema = undefined; throw error; });
  await schema;
}
export type DiscordLink = { discordId: string; username: string; verified: boolean };
export async function discordControlEnabled() {
  await ready();
  const result = await rows("SELECT enabled FROM discord_controls WHERE id=1");
  return result[0]?.enabled === true;
}
export async function setDiscordControl(enabled: boolean) {
  await ready();
  await sql().query("UPDATE discord_controls SET enabled=$1 WHERE id=1", [enabled]);
}
export async function getDiscordLink(userSub: string): Promise<DiscordLink | null> {
  await ready();
  const result = await rows("SELECT discord_id, username, verified_at FROM discord_links WHERE user_sub = $1", [userSub]);
  return result[0] ? { discordId: String(result[0].discord_id), username: String(result[0].username), verified: Boolean(result[0].verified_at) } : null;
}
export async function linkDiscord(userSub: string, discordId: string, username: string) {
  await ready();
  await sql().query(`INSERT INTO discord_links (user_sub, discord_id, username) VALUES ($1,$2,$3)
    ON CONFLICT (user_sub) DO UPDATE SET discord_id = EXCLUDED.discord_id, username = EXCLUDED.username, verified_at = NULL`, [userSub, discordId, username.slice(0, 100)]);
  await sql().query("DELETE FROM discord_outbox WHERE user_sub = $1 AND kind = 'dm' AND status <> 'sent'", [userSub]);
}
export async function unlinkDiscord(userSub: string) {
  await ready();
  await sql().query("DELETE FROM discord_links WHERE user_sub = $1", [userSub]);
  await sql().query("DELETE FROM discord_outbox WHERE user_sub = $1 AND kind = 'dm'", [userSub]);
  await sql().query("DELETE FROM discord_alert_receipts WHERE user_sub = $1", [userSub]);
}
export async function verifyDiscordLink(userSub: string, recipient: string) {
  await ready();
  await sql().query("UPDATE discord_links SET verified_at = NOW() WHERE user_sub = $1 AND discord_id = $2", [userSub, recipient]);
}
export async function discordRateLimit(key: string, limit: number, windowSeconds: number) {
  await ready();
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const result = await rows(`INSERT INTO discord_rate_limits (key,count,expires_at) VALUES ($1,1,$2)
    ON CONFLICT (key) DO UPDATE SET count = discord_rate_limits.count + 1 WHERE discord_rate_limits.count < $3 RETURNING count`,
    [`${key}:${bucket}`, new Date((bucket + 1) * windowSeconds * 1000).toISOString(), limit]);
  return result.length > 0;
}
export async function saveDiscordState(state: string, userSub: string) {
  await ready();
  await sql().query("INSERT INTO discord_oauth_states (state_hash,user_sub,expires_at) VALUES ($1,$2,NOW()+INTERVAL '10 minutes')", [discordHash(state), userSub]);
}
export async function consumeDiscordState(state: string, userSub: string) {
  await ready();
  const result = await rows("DELETE FROM discord_oauth_states WHERE state_hash=$1 AND user_sub=$2 AND expires_at>NOW() RETURNING user_sub", [discordHash(state), userSub]);
  return result.length === 1;
}
export type DiscordPayload = { content?: string; embeds?: Array<Record<string, unknown>>; bargainGameIds?: string[]; signatures?: string[]; region?: string; prices?: Array<{ gameId: string; store: string; currency: string; price: number; type: string; thresholdUsd?: number | null }> };
export async function getRecentDiscordBargains() {
  await ready();
  const result = await rows("SELECT game_id FROM discord_weekly_bargains WHERE sent_at>NOW()-INTERVAL '60 days'");
  return new Set(result.map((row) => String(row.game_id)));
}
export async function discordUnsentSignatures(userSub: string, signatures: string[]) {
  await ready();
  const result = await rows("SELECT signature FROM discord_alert_receipts WHERE user_sub=$1 AND signature = ANY($2::text[])", [userSub, signatures]);
  return new Set(result.map((row) => String(row.signature)));
}
export async function enqueueDiscord(id: string, kind: "dm" | "weekly", userSub: string, recipient: string, payload: DiscordPayload) {
  await ready();
  await sql().query(`INSERT INTO discord_outbox (id,kind,user_sub,recipient,payload,expires_at) VALUES ($1,$2,$3,$4,$5::jsonb,NOW()+INTERVAL '2 days')
    ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, recipient=EXCLUDED.recipient
    WHERE discord_outbox.status='pending' AND discord_outbox.attempts=0`, [discordHash(id), kind, userSub, recipient, JSON.stringify(payload)]);
}
export type DiscordJob = { id: string; kind: "dm" | "weekly"; userSub: string; recipient: string; payload: DiscordPayload; owner: string; attempts: number };
export async function claimDiscordJob(onlyId: string | null = null): Promise<DiscordJob | null> {
  await ready();
  const owner = randomUUID();
  const result = await rows(`UPDATE discord_outbox SET status='sending', owner=$1, attempts=attempts+1, claimed_at=NOW()
    WHERE id=(SELECT id FROM discord_outbox WHERE status='pending' AND next_at<=NOW() AND expires_at>NOW() AND attempts<3 AND ($2::text IS NULL OR id=$2) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    AND status='pending' RETURNING *`, [owner, onlyId]);
  const row = result[0];
  return row ? { id: String(row.id), kind: row.kind as "dm" | "weekly", userSub: String(row.user_sub), recipient: String(row.recipient), payload: row.payload as DiscordPayload, owner, attempts: Number(row.attempts) } : null;
}
export async function finishDiscordJob(job: DiscordJob, status: "sent" | "pending" | "blocked" | "uncertain", retrySeconds = 60) {
  await ready();
  if (status === "sent" && job.kind === "dm" && job.payload.signatures?.length) {
    await sql().query("INSERT INTO discord_alert_receipts (user_sub,signature) SELECT $1,signature FROM unnest($2::text[]) AS signature WHERE EXISTS (SELECT 1 FROM discord_outbox WHERE id=$3 AND owner=$4 AND status='sending') ON CONFLICT DO NOTHING", [job.userSub, job.payload.signatures, job.id, job.owner]);
  }
  // Commit the confirmed weekly delivery and its cooldown together, guarded by claim ownership.
  await sql().query(`WITH finished AS (
    UPDATE discord_outbox SET status=$1::varchar,next_at=$2,sent_at=CASE WHEN $1::varchar='sent' THEN NOW() ELSE sent_at END
    WHERE id=$3 AND owner=$4 AND status='sending' RETURNING kind,status)
    INSERT INTO discord_weekly_bargains (game_id,sent_at)
    SELECT DISTINCT game_id,NOW() FROM unnest($5::text[]) AS game_id
    WHERE EXISTS (SELECT 1 FROM finished WHERE kind='weekly' AND status='sent')
    ON CONFLICT (game_id) DO UPDATE SET sent_at=EXCLUDED.sent_at`,
    [status, new Date(Date.now() + retrySeconds * 1000).toISOString(), job.id, job.owner, (job.payload.bargainGameIds ?? []).slice(0, 3)]);
}
export async function pruneDiscordStore() {
  await ready();
  // Ambiguous deliveries are never automatically resent: a timeout may have happened after acceptance.
  await sql().query("UPDATE discord_outbox SET status='uncertain' WHERE status='sending' AND COALESCE(claimed_at,created_at)<NOW()-INTERVAL '1 hour'");
  await sql().query("DELETE FROM discord_outbox WHERE expires_at<NOW()-INTERVAL '7 days'");
  await sql().query("DELETE FROM discord_alert_receipts WHERE created_at<NOW()-INTERVAL '90 days'");
  await sql().query("DELETE FROM discord_weekly_bargains WHERE sent_at<NOW()-INTERVAL '90 days'");
  await sql().query("DELETE FROM discord_oauth_states WHERE expires_at<NOW()");
  await sql().query("DELETE FROM discord_rate_limits WHERE expires_at<NOW()");
}
