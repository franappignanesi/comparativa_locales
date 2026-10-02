import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";

export const OFFER_CAMPAIGN = "steam-autumn-2026";
export const OFFER_VOTE_LIMIT = 5;
export const OFFER_VOTE_TAG = "community-offer-votes";
let client: ReturnType<typeof neon> | undefined;
let schema: Promise<void> | undefined;
function sql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw Error("Vote storage unavailable");
  return client ??= neon(url);
}
async function query(text: string, params: unknown[] = []) {
  return await sql().query(text, params) as Array<Record<string, unknown>>;
}
async function ready() {
  schema ??= sql().query(`CREATE TABLE IF NOT EXISTS community_offer_votes (
    campaign VARCHAR(64) NOT NULL, user_sub VARCHAR(191) NOT NULL,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 5), game_id VARCHAR(191) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(campaign,user_sub,slot), UNIQUE(campaign,user_sub,game_id))`).then(() => undefined)
    .catch(error => { schema = undefined; throw error; });
  await schema;
}
export async function getOfferVotes(userSub: string, campaign = OFFER_CAMPAIGN): Promise<string[]> {
  await ready();
  const rows = await query("SELECT game_id FROM community_offer_votes WHERE campaign=$1 AND user_sub=$2 ORDER BY slot", [campaign, userSub]);
  return rows.map(row => String(row.game_id));
}
export async function setOfferVote(userSub: string, gameId: string, voted: boolean, campaign = OFFER_CAMPAIGN) {
  await ready();
  if (!voted) {
    await sql().query("DELETE FROM community_offer_votes WHERE campaign=$1 AND user_sub=$2 AND game_id=$3", [campaign, userSub, gameId]);
  } else {
    // Five unique slots enforce the cap in Postgres, including concurrent requests.
    for (let attempt = 0; attempt < OFFER_VOTE_LIMIT; attempt++) {
      const inserted = await query(`INSERT INTO community_offer_votes(campaign,user_sub,slot,game_id)
        SELECT $1::varchar,$2::varchar,s.slot::smallint,$3::varchar FROM generate_series(1,5) AS s(slot)
        WHERE NOT EXISTS (SELECT 1 FROM community_offer_votes WHERE campaign=$1 AND user_sub=$2 AND slot=s.slot)
        AND NOT EXISTS (SELECT 1 FROM community_offer_votes WHERE campaign=$1 AND user_sub=$2 AND game_id=$3)
        ORDER BY s.slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING game_id`, [campaign, userSub, gameId]);
      const votes = await getOfferVotes(userSub, campaign);
      if (inserted.length || votes.includes(gameId) || votes.length >= OFFER_VOTE_LIMIT) return votes;
    }
  }
  return getOfferVotes(userSub, campaign);
}
export const getOfferRanking = unstable_cache(async () => {
  await ready();
  const rows = await query(`SELECT game_id,COUNT(*) AS votes FROM community_offer_votes
    WHERE campaign=$1 GROUP BY game_id ORDER BY votes DESC,game_id LIMIT 5000`, [OFFER_CAMPAIGN]);
  return rows.map(row => ({ gameId: String(row.game_id), votes: Number(row.votes) }));
}, ["community-offer-ranking", OFFER_CAMPAIGN], { revalidate: 60, tags: [OFFER_VOTE_TAG] });
