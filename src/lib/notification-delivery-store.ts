import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { RegionId } from "./regions";
import type { StoreId } from "./types";
import type { WishlistAlertType } from "./wishlist-alerts";

type NotificationChannel = "email" | "web_push";
type Sql = ReturnType<typeof neon>;
type NotificationSignatureInput = {
  region: RegionId;
  gameId: string;
  store: StoreId;
  type: WishlistAlertType;
};

let sqlClient: Sql | null = null;
let initialized = false;

export async function claimNotificationDelivery(input: {
  channel: NotificationChannel;
  userSub: string;
  region: RegionId;
  gameId: string;
  store: StoreId;
  type: WishlistAlertType;
}): Promise<boolean> {
  if (!hasPostgresConfig()) return false;
  await ensureSchema();
  const signature = createSignature(input);
  const rows = (await getSql().query(
    `INSERT INTO notification_deliveries (channel, user_sub, signature, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel, user_sub, signature) DO NOTHING
     RETURNING id`,
    [input.channel, input.userSub, signature, new Date().toISOString()]
  )) as Array<Record<string, unknown>>;
  return rows.length > 0;
}

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await getSql().query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      channel VARCHAR(32) NOT NULL,
      user_sub VARCHAR(191) NOT NULL,
      signature VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (channel, user_sub, signature)
    )
  `);
  await getSql().query("CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created ON notification_deliveries (created_at)");
  initialized = true;
}

function createSignature(input: NotificationSignatureInput): string {
  return createHash("sha256").update(`${input.region}:${input.gameId}:${input.store}:${input.type}`).digest("hex");
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
