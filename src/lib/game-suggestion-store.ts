import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { GameSuggestion, SuggestionPreview, SuggestionStatus } from "./game-suggestion-types";
import type { GameCandidate } from "./types";

let client: ReturnType<typeof neon> | undefined;
let schema: Promise<void> | undefined;
function sql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw Error("Suggestion storage is not configured");
  return client ??= neon(url);
}
async function rows(query: string, params: unknown[] = []) {
  return await sql().query(query, params) as Array<Record<string, unknown>>;
}
async function ready() {
  schema ??= (async () => {
    await sql().query(`CREATE TABLE IF NOT EXISTS game_suggestions (
      id VARCHAR(64) PRIMARY KEY, status VARCHAR(20) NOT NULL DEFAULT 'pending', data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      owner UUID, claimed_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0)`);
    await sql().query(`CREATE TABLE IF NOT EXISTS game_suggestion_supporters (
      suggestion_id VARCHAR(64) NOT NULL REFERENCES game_suggestions(id), user_sub VARCHAR(191) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(suggestion_id,user_sub))`);
    await sql().query(`CREATE TABLE IF NOT EXISTS game_suggestion_limits (
      key VARCHAR(100) PRIMARY KEY, count INT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`);
    await sql().query("CREATE INDEX IF NOT EXISTS idx_game_suggestions_status ON game_suggestions(status,created_at)");
  })().catch(e => { schema = undefined; throw e; });
  await schema;
}
export async function suggestionRateLimit(user: string, kind: string, limit: number, seconds: number) {
  await ready();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = createHash("sha256").update(`${user}:${kind}:${bucket}`).digest("hex");
  const result = await rows(`INSERT INTO game_suggestion_limits(key,count,expires_at) VALUES($1,1,$2)
    ON CONFLICT(key) DO UPDATE SET count=game_suggestion_limits.count+1 WHERE game_suggestion_limits.count<$3 RETURNING count`,
    [key, new Date((bucket + 1) * seconds * 1000).toISOString(), limit]);
  return !!result.length;
}
function fromRow(row: Record<string, unknown>): GameSuggestion {
  return { message: null, candidate: null, gameId: null, ...(row.data as SuggestionPreview), id: String(row.id), status: row.status as SuggestionStatus,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
    supporters: Number(row.supporters ?? 0) };
}
export async function saveGameSuggestion(preview: SuggestionPreview, userSub: string) {
  await ready();
  const id = createHash("sha256").update(`${preview.store}:${preview.storeId}`).digest("hex");
  await sql().query("INSERT INTO game_suggestions(id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING", [id, JSON.stringify(preview)]);
  await sql().query("INSERT INTO game_suggestion_supporters(suggestion_id,user_sub) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, userSub]);
  return id;
}
export async function listGameSuggestions() {
  await ready();
  const result = await rows(`SELECT s.*, (SELECT COUNT(*) FROM game_suggestion_supporters v WHERE v.suggestion_id=s.id) AS supporters
    FROM game_suggestions s ORDER BY CASE WHEN status IN ('published','discarded') THEN 1 ELSE 0 END, created_at DESC LIMIT 500`);
  return result.map(fromRow);
}
export async function changeSuggestion(id: string | null, action: "search" | "approve" | "discard") {
  await ready();
  if (!id && action !== "search") return 0;
  const status = action === "search" ? "queued" : action === "approve" ? "approved" : "discarded";
  const allowed = action === "search" ? ["pending", "review", "ready"] : action === "approve" ? ["ready"] : ["pending", "queued", "ready", "review", "approved"];
  const result = await rows(`UPDATE game_suggestions SET status=$1, attempts=0, updated_at=NOW()
    WHERE id IN (SELECT id FROM game_suggestions WHERE ($2::text IS NULL OR id=$2) AND ($2::text IS NOT NULL OR status<>'ready') AND status=ANY($3::text[]) ORDER BY created_at LIMIT 500)
    AND status=ANY($3::text[]) AND ($1<>'approved' OR data->'candidate' IS NOT NULL AND data->'candidate'<>'null'::jsonb) RETURNING id`, [status, id, allowed]);
  return result.length;
}
export async function claimSuggestion(): Promise<(GameSuggestion & { owner: string }) | null> {
  await ready();
  await sql().query("UPDATE game_suggestions SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'review' END, owner=NULL WHERE status='searching' AND claimed_at<NOW()-INTERVAL '10 minutes'");
  const owner = randomUUID();
  const result = await rows(`UPDATE game_suggestions SET status='searching',owner=$1,claimed_at=NOW(),attempts=attempts+1,updated_at=NOW()
    WHERE id=(SELECT id FROM game_suggestions WHERE status='queued' AND attempts<3 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    AND status='queued' RETURNING *`, [owner]);
  return result[0] ? { ...fromRow(result[0]), owner } : null;
}
export async function finishSuggestion(job: GameSuggestion & { owner: string }, candidate: GameCandidate | null, message: string, gameId: string | null = null) {
  await ready();
  const data = { candidate, message: message.slice(0, 1000), gameId };
  await sql().query(`UPDATE game_suggestions SET status=$1,data=data||$2::jsonb,owner=NULL,updated_at=NOW()
    WHERE id=$3 AND owner=$4 AND status='searching'`, [gameId ? "published" : candidate ? "ready" : "review", JSON.stringify(data), job.id, job.owner]);
}
export async function queuedIncorporations() {
  await ready();
  return (await rows("SELECT * FROM game_suggestions WHERE status IN ('approved','publishing') ORDER BY created_at LIMIT 50")).map(fromRow);
}
export async function markSuggestionPublishing(id: string, gameId: string) {
  await ready();
  return (await rows(`UPDATE game_suggestions SET status='publishing',data=data||$2::jsonb,updated_at=NOW()
    WHERE id=$1 AND status IN ('approved','publishing') RETURNING id`, [id, JSON.stringify({ gameId, message: "Esperando actualización de precios y publicación." })])).length > 0;
}
export async function confirmSuggestionPublished(id: string) {
  await ready();
  await sql().query("UPDATE game_suggestions SET status='published',updated_at=NOW(),data=data||$2::jsonb WHERE id=$1 AND status='publishing'", [id, JSON.stringify({ message: "La ficha ya está disponible en BARATEAM." })]);
}
export async function pruneSuggestionLimits() {
  await ready();
  await sql().query("DELETE FROM game_suggestion_limits WHERE expires_at<NOW()");
}
