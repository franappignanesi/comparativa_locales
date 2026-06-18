import { createHash } from "node:crypto";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { JobLock } from "./job-lock";

type OperationalSql = ReturnType<typeof neon>;

let sqlClient: OperationalSql | null = null;
let initialized = false;

export function hasOperationalStore(): boolean {
  return Boolean(postgresConnectionString(false));
}

export function stateKeyFromPath(filePath: string): string {
  const relative = path.relative(path.join(process.cwd(), "data"), filePath);
  return relative && !relative.startsWith("..") ? relative.replace(/\\/g, "/") : filePath.replace(/\\/g, "/");
}

export async function readJsonState<T>(key: string): Promise<T | null> {
  if (!hasOperationalStore()) return null;
  await ensureSchema();
  const rows = await queryRows("SELECT value FROM app_json_state WHERE key = $1 LIMIT 1", [key]);
  return rows[0]?.value ? (rows[0].value as T) : null;
}

export async function writeJsonState(key: string, value: unknown): Promise<void> {
  if (!hasOperationalStore()) return;
  await ensureSchema();
  const serialized = JSON.stringify(value);
  const hash = sha256(serialized);
  await getSql().query(
    `INSERT INTO app_json_state (key, value, hash, updated_at)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, hash = EXCLUDED.hash, updated_at = EXCLUDED.updated_at`,
    [key, serialized, hash, new Date().toISOString()]
  );
  if (isPriceSnapshotKey(key)) {
    await getSql().query(
      `INSERT INTO price_snapshots (state_key, hash, value, created_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (state_key, hash) DO NOTHING`,
      [key, hash, serialized, new Date().toISOString()]
    );
  }
}

export async function acquireOperationalLock(
  lock: JobLock
): Promise<{ acquired: true; lock: JobLock; release: () => Promise<void> } | { acquired: false; lock: JobLock | null } | null> {
  if (!hasOperationalStore()) return null;
  await ensureSchema();
  const sql = getSql();
  await sql.query("DELETE FROM job_locks WHERE expires_at <= $1", [new Date().toISOString()]);
  const rows = await queryRows(
    `INSERT INTO job_locks (name, owner, created_at, expires_at, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (name) DO NOTHING
     RETURNING name, owner, created_at, expires_at, metadata`,
    [lock.name, lock.owner, lock.createdAt, lock.expiresAt, JSON.stringify(lock.metadata ?? {})]
  );
  if (rows[0]) {
    return {
      acquired: true,
      lock: rowToLock(rows[0]),
      release: async () => releaseOperationalLock(lock.name, lock.owner)
    };
  }
  const active = await queryRows("SELECT name, owner, created_at, expires_at, metadata FROM job_locks WHERE name = $1 LIMIT 1", [lock.name]);
  return { acquired: false, lock: active[0] ? rowToLock(active[0]) : null };
}

export async function readOperationalLock(name: string): Promise<JobLock | null> {
  if (!hasOperationalStore()) return null;
  await ensureSchema();
  const rows = await queryRows("SELECT name, owner, created_at, expires_at, metadata FROM job_locks WHERE name = $1 LIMIT 1", [name]);
  return rows[0] ? rowToLock(rows[0]) : null;
}

export async function recordRefreshRun(input: { name: string; ok: boolean; statusCode: number; summary: unknown }): Promise<void> {
  if (!hasOperationalStore()) return;
  await ensureSchema();
  const summary = {
    ...(typeof input.summary === "object" && input.summary ? (input.summary as Record<string, unknown>) : { value: input.summary }),
    storage: await getStorageMetrics()
  };
  await getSql().query(
    `INSERT INTO refresh_runs (name, ok, status_code, summary, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [input.name, input.ok, input.statusCode, JSON.stringify(summary), new Date().toISOString()]
  );
}

async function releaseOperationalLock(name: string, owner: string): Promise<void> {
  await getSql().query("DELETE FROM job_locks WHERE name = $1 AND owner = $2", [name, owner]);
}

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  const sql = getSql();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS app_json_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      hash VARCHAR(64) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS job_locks (
      name VARCHAR(120) PRIMARY KEY,
      owner VARCHAR(191) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await sql.query("CREATE INDEX IF NOT EXISTS idx_job_locks_expires ON job_locks (expires_at)");
  await sql.query(`
    CREATE TABLE IF NOT EXISTS refresh_runs (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      ok BOOLEAN NOT NULL,
      status_code INT NOT NULL,
      summary JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `);
  await sql.query("CREATE INDEX IF NOT EXISTS idx_refresh_runs_name_created ON refresh_runs (name, created_at DESC)");
  await sql.query(`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id BIGSERIAL PRIMARY KEY,
      state_key TEXT NOT NULL,
      hash VARCHAR(64) NOT NULL,
      value JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (state_key, hash)
    )
  `);
  initialized = true;
}

function getSql(): OperationalSql {
  sqlClient ??= neon(postgresConnectionString());
  return sqlClient;
}

async function queryRows(query: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  return (await getSql().query(query, params)) as Array<Record<string, unknown>>;
}

function postgresConnectionString(required = true): string {
  const value = process.env.POSTGRES_URL || (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : "");
  if (!value && required) throw new Error("Missing Postgres config. Set POSTGRES_URL or a postgres DATABASE_URL.");
  return value;
}

function rowToLock(row: Record<string, unknown>): JobLock {
  return {
    name: String(row.name),
    owner: String(row.owner),
    createdAt: dateIso(row.created_at),
    expiresAt: dateIso(row.expires_at),
    metadata: parseMetadata(row.metadata)
  };
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function dateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isPriceSnapshotKey(key: string): boolean {
  return /(^|\/)latest-prices(-[A-Z]{2})?\.json$/.test(key);
}

async function getStorageMetrics(): Promise<Record<string, unknown>> {
  const tables = ["app_json_state", "job_locks", "refresh_runs", "price_snapshots", "problem_reports", "users", "wishlist_items"];
  const metrics: Record<string, unknown> = {};
  for (const table of tables) {
    try {
      const rows = await queryRows(`SELECT COUNT(*) AS rows, pg_total_relation_size($1::regclass) AS bytes`, [table]);
      metrics[table] = { rows: Number(rows[0]?.rows ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
    } catch {
      metrics[table] = { rows: 0, bytes: 0 };
    }
  }
  return metrics;
}
