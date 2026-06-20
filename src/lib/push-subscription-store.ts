import { neon } from "@neondatabase/serverless";

type PushSubscriptionKeys = {
  p256dh?: string;
  auth?: string;
};

export type StoredPushSubscription = {
  userSub: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PushSubscriptionInput = {
  endpoint?: string;
  keys?: PushSubscriptionKeys;
};

type Sql = ReturnType<typeof neon>;

let sqlClient: Sql | null = null;
let initialized = false;

export async function upsertPushSubscription(userSub: string, subscription: PushSubscriptionInput, userAgent: string | null): Promise<void> {
  const endpoint = subscription.endpoint?.slice(0, 2048);
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!endpoint || !p256dh || !auth || !hasPostgresConfig()) return;
  await ensureSchema();
  const now = new Date().toISOString();
  await getSql().query(
    `INSERT INTO web_push_subscriptions (endpoint, user_sub, p256dh, auth, user_agent, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (endpoint) DO UPDATE SET user_sub = EXCLUDED.user_sub, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, updated_at = EXCLUDED.updated_at`,
    [endpoint, userSub, p256dh, auth, userAgent, now, now]
  );
}

export async function deletePushSubscription(userSub: string, endpoint: string): Promise<void> {
  if (!endpoint || !hasPostgresConfig()) return;
  await ensureSchema();
  await getSql().query("DELETE FROM web_push_subscriptions WHERE user_sub = $1 AND endpoint = $2", [userSub, endpoint]);
}

export async function listPushSubscriptionsForUser(userSub: string): Promise<StoredPushSubscription[]> {
  if (!hasPostgresConfig()) return [];
  await ensureSchema();
  const rows = (await getSql().query("SELECT * FROM web_push_subscriptions WHERE user_sub = $1", [userSub])) as Array<Record<string, unknown>>;
  return rows.map(rowToSubscription);
}

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await getSql().query(`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_sub VARCHAR(191) NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await getSql().query("CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON web_push_subscriptions (user_sub)");
  initialized = true;
}

function rowToSubscription(row: Record<string, unknown>): StoredPushSubscription {
  return {
    endpoint: String(row.endpoint ?? ""),
    userSub: String(row.user_sub ?? ""),
    p256dh: String(row.p256dh ?? ""),
    auth: String(row.auth ?? ""),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

function getSql(): Sql {
  sqlClient ??= neon(postgresConnectionString());
  return sqlClient;
}

function hasPostgresConfig(): boolean {
  return Boolean(postgresConnectionString(false));
}

function postgresConnectionString(required = true): string {
  const value = process.env.POSTGRES_URL || (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : "");
  if (!value && required) throw new Error("Missing Postgres config. Set POSTGRES_URL or a postgres DATABASE_URL.");
  return value;
}

function dateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
