import { neon } from "@neondatabase/serverless";
import { wishlistNotificationAllowed, type NotificationPrice, type WishlistNotificationState } from "./wishlist-notification-policy";
import type { WishlistAlert } from "./wishlist-alerts";

export type WishlistNotificationChannel = "discord" | "email" | "web_push";
let client: ReturnType<typeof neon> | undefined;
let schema: Promise<void> | undefined;
function sql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Wishlist notification memory requires Postgres");
  return client ??= neon(url);
}

export async function ensureWishlistNotificationState() {
  schema ??= sql().query(`CREATE TABLE IF NOT EXISTS wishlist_notification_state (
    channel VARCHAR(32) NOT NULL, user_sub VARCHAR(191) NOT NULL, game_id VARCHAR(191) NOT NULL,
    region VARCHAR(8) NOT NULL, currency VARCHAR(8) NOT NULL, price DOUBLE PRECISION NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL, rearmed BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (channel,user_sub,game_id))`).then(() => {}).catch(error => { schema = undefined; throw error; });
  await schema;
}

export async function wishlistNotificationStates(channel: WishlistNotificationChannel, userSub: string) {
  await ensureWishlistNotificationState();
  const result = await sql().query("SELECT * FROM wishlist_notification_state WHERE channel=$1 AND user_sub=$2", [channel, userSub]) as Array<Record<string, unknown>>;
  return new Map(result.map(row => [String(row.game_id), {
    gameId: String(row.game_id), region: String(row.region), currency: String(row.currency), price: Number(row.price),
    sentAt: new Date(String(row.sent_at)).toISOString(), rearmed: row.rearmed === true,
  } satisfies WishlistNotificationState]));
}

export function alertNotificationPrice(alert: WishlistAlert): NotificationPrice {
  return { gameId: alert.gameId, region: alert.region, currency: alert.currentCurrency ?? "", price: alert.currentOfficialPrice ?? NaN };
}

export async function filterWishlistNotifications(channel: WishlistNotificationChannel, userSub: string, alerts: WishlistAlert[]) {
  const states = await wishlistNotificationStates(channel, userSub);
  return { states, alerts: alerts.filter(alert => wishlistNotificationAllowed(alertNotificationPrice(alert), states.get(alert.gameId))) };
}

export async function recordWishlistNotifications(channel: WishlistNotificationChannel, userSub: string, prices: NotificationPrice[]) {
  if (!prices.length) return;
  await ensureWishlistNotificationState();
  await sql().query(`INSERT INTO wishlist_notification_state (channel,user_sub,game_id,region,currency,price,sent_at)
    SELECT $1,$2,p."gameId",p.region,p.currency,p.price,NOW()
    FROM jsonb_to_recordset($3::jsonb) AS p("gameId" text,region text,currency text,price double precision)
    ON CONFLICT (channel,user_sub,game_id) DO UPDATE SET region=EXCLUDED.region,currency=EXCLUDED.currency,
    price=EXCLUDED.price,sent_at=EXCLUDED.sent_at,rearmed=FALSE`, [channel, userSub, JSON.stringify(prices)]);
}

// Only fresh, successfully observed games can rearm an ended condition; outages cannot.
export async function rearmWishlistNotifications(userSub: string, eligibleIds: string[], observedIds: string[]) {
  if (!observedIds.length) return;
  await ensureWishlistNotificationState();
  await sql().query(`UPDATE wishlist_notification_state SET rearmed=TRUE
    WHERE user_sub=$1 AND game_id=ANY($2::text[]) AND NOT (game_id=ANY($3::text[]))`, [userSub, observedIds, eligibleIds]);
}
