import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import mysql from "mysql2/promise";

type StoredUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  updatedAt: string;
  notificationSettings?: unknown;
};

type StoredWishlistItem = {
  gameId: string;
  title: string;
  coverUrl?: string | null;
  category: string;
  releaseYear: number;
  addedAt: string;
  notificationEnabled?: boolean;
  notificationPreferences?: unknown;
};

type UsersJson = {
  users?: Record<string, StoredUser>;
  wishlists?: Record<string, StoredWishlistItem[]>;
};

type ProblemReport = {
  id: string;
  numericId?: number;
  category: string;
  description: string;
  screenshot?: string | null;
  pageUrl: string;
  userAgent: string;
  viewport: string;
  userSub?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  feedbackMessage?: string | null;
  feedbackSentAt?: string | null;
  feedbackBy?: string | null;
};

type ReportsJson = {
  reports?: ProblemReport[];
};

type NeonSql = NeonQueryFunction<false, false>;

const root = process.cwd();
const usersPath = path.join(root, "data", "generated", "users.json");
const reportsPath = path.join(root, "data", "generated", "problem-reports.json");

const defaultNotificationSettings = {
  email: false,
  webPush: false,
  discord: false,
  enabledStores: ["steam", "epic", "gog", "humble", "microsoft"]
};

const defaultWishlistPreferences = {
  priceDrop: true,
  historicalLow: false,
  belowUsd: false,
  belowUsdValue: null
};

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");

  const usersDb = await readJson<UsersJson>(usersPath, { users: {}, wishlists: {} });
  const reportsDb = await readJson<ReportsJson>(reportsPath, { reports: [] });

  const migrated = hasPostgresConfig()
    ? await migratePostgres(usersDb, reportsDb)
    : await migrateMysql(usersDb, reportsDb);

  console.log(JSON.stringify({ ok: true, backend: hasPostgresConfig() ? "postgres" : "mysql", migrated }, null, 2));
}

async function migrateMysql(usersDb: UsersJson, reportsDb: ReportsJson) {
  const pool = mysql.createPool(mysqlConfig());
  await ensureSchema(pool);

  let userCount = 0;
  let wishlistCount = 0;
  let reportCount = 0;

  for (const [userId, user] of Object.entries(usersDb.users ?? {})) {
    await upsertUser(pool, userId, user);
    userCount += 1;
  }

  for (const [userId, wishlist] of Object.entries(usersDb.wishlists ?? {})) {
    await ensureUserPlaceholder(pool, userId);
    for (const item of wishlist ?? []) {
      await upsertWishlistItem(pool, userId, item);
      wishlistCount += 1;
    }
  }

  for (const report of reportsDb.reports ?? []) {
    await upsertReport(pool, report);
    reportCount += 1;
  }

  await pool.end();
  return { users: userCount, wishlistItems: wishlistCount, problemReports: reportCount };
}

async function migratePostgres(usersDb: UsersJson, reportsDb: ReportsJson) {
  const sql = neon(postgresConnectionString());
  await ensurePostgresSchema(sql);

  let userCount = 0;
  let wishlistCount = 0;
  let reportCount = 0;

  for (const [userId, user] of Object.entries(usersDb.users ?? {})) {
    await upsertPostgresUser(sql, userId, user);
    userCount += 1;
  }

  for (const [userId, wishlist] of Object.entries(usersDb.wishlists ?? {})) {
    await ensurePostgresUserPlaceholder(sql, userId);
    for (const item of wishlist ?? []) {
      await upsertPostgresWishlistItem(sql, userId, item);
      wishlistCount += 1;
    }
  }

  for (const report of reportsDb.reports ?? []) {
    await upsertPostgresReport(sql, report);
    reportCount += 1;
  }

  return { users: userCount, wishlistItems: wishlistCount, problemReports: reportCount };
}

function loadDotEnv(fileName: string) {
  const fs = require("node:fs") as typeof import("node:fs");
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = unquote(match[2]);
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function ensureSchema(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      sub VARCHAR(191) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      picture TEXT NULL,
      notification_settings JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      user_sub VARCHAR(191) NOT NULL,
      game_id VARCHAR(191) NOT NULL,
      title VARCHAR(255) NOT NULL,
      cover_url TEXT NULL,
      category VARCHAR(100) NOT NULL,
      release_year INT NOT NULL,
      added_at DATETIME(3) NOT NULL,
      notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notification_preferences JSON NOT NULL,
      PRIMARY KEY (user_sub, game_id),
      INDEX idx_wishlist_user_added (user_sub, added_at),
      CONSTRAINT fk_wishlist_user FOREIGN KEY (user_sub) REFERENCES users(sub) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS problem_reports (
      id VARCHAR(80) PRIMARY KEY,
      numeric_id BIGINT NULL,
      category VARCHAR(80) NOT NULL,
      description TEXT NOT NULL,
      screenshot MEDIUMTEXT NULL,
      page_url TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      viewport VARCHAR(80) NOT NULL,
      user_sub VARCHAR(191) NULL,
      user_email VARCHAR(191) NULL,
      user_name VARCHAR(191) NULL,
      created_at DATETIME NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_at DATETIME NULL,
      resolved_by VARCHAR(191) NULL,
      feedback_message TEXT NULL,
      feedback_sent_at DATETIME NULL,
      feedback_by VARCHAR(191) NULL,
      INDEX idx_problem_reports_created (created_at),
      INDEX idx_problem_reports_category (category),
      INDEX idx_problem_reports_resolved (resolved, created_at),
      INDEX idx_problem_reports_numeric (numeric_id),
      INDEX idx_problem_reports_user (user_sub, user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensurePostgresSchema(sql: NeonSql) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS users (
      sub VARCHAR(191) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      picture TEXT NULL,
      notification_settings JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      user_sub VARCHAR(191) NOT NULL,
      game_id VARCHAR(191) NOT NULL,
      title VARCHAR(255) NOT NULL,
      cover_url TEXT NULL,
      category VARCHAR(100) NOT NULL,
      release_year INT NOT NULL,
      added_at TIMESTAMPTZ NOT NULL,
      notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notification_preferences JSONB NOT NULL,
      PRIMARY KEY (user_sub, game_id),
      CONSTRAINT fk_wishlist_user FOREIGN KEY (user_sub) REFERENCES users(sub) ON DELETE CASCADE
    )
  `);
  await sql.query("CREATE INDEX IF NOT EXISTS idx_wishlist_user_added ON wishlist_items (user_sub, added_at)");

  await sql.query(`
    CREATE TABLE IF NOT EXISTS problem_reports (
      id VARCHAR(80) PRIMARY KEY,
      numeric_id BIGINT NULL,
      category VARCHAR(80) NOT NULL,
      description TEXT NOT NULL,
      screenshot TEXT NULL,
      page_url TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      viewport VARCHAR(80) NOT NULL,
      user_sub VARCHAR(191) NULL,
      user_email VARCHAR(191) NULL,
      user_name VARCHAR(191) NULL,
      created_at TIMESTAMPTZ NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_at TIMESTAMPTZ NULL,
      resolved_by VARCHAR(191) NULL,
      feedback_message TEXT NULL,
      feedback_sent_at TIMESTAMPTZ NULL,
      feedback_by VARCHAR(191) NULL
    )
  `);
  await sql.query("CREATE INDEX IF NOT EXISTS idx_problem_reports_created ON problem_reports (created_at)");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_problem_reports_category ON problem_reports (category)");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_problem_reports_resolved ON problem_reports (resolved, created_at)");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_problem_reports_numeric ON problem_reports (numeric_id)");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_problem_reports_user ON problem_reports (user_sub, user_email)");
}

async function upsertUser(pool: mysql.Pool, userId: string, user: StoredUser) {
  const createdAt = mysqlDate(user.createdAt);
  const updatedAt = mysqlDate(user.updatedAt);
  await pool.execute(
    `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), picture = VALUES(picture),
       notification_settings = VALUES(notification_settings), updated_at = VALUES(updated_at)`,
    [
      user.sub || userId,
      user.email ?? "",
      user.name ?? "Usuario",
      user.picture ?? null,
      JSON.stringify(user.notificationSettings ?? defaultNotificationSettings),
      createdAt,
      updatedAt
    ]
  );
}

async function ensureUserPlaceholder(pool: mysql.Pool, userId: string) {
  const now = mysqlDate(new Date().toISOString());
  await pool.execute(
    `INSERT IGNORE INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
     VALUES (?, '', 'Usuario', NULL, ?, ?, ?)`,
    [userId, JSON.stringify(defaultNotificationSettings), now, now]
  );
}

async function upsertWishlistItem(pool: mysql.Pool, userId: string, item: StoredWishlistItem) {
  await pool.execute(
    `INSERT INTO wishlist_items
      (user_sub, game_id, title, cover_url, category, release_year, added_at, notification_enabled, notification_preferences)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), cover_url = VALUES(cover_url), category = VALUES(category),
       release_year = VALUES(release_year), notification_enabled = VALUES(notification_enabled),
       notification_preferences = VALUES(notification_preferences)`,
    [
      userId,
      item.gameId,
      item.title,
      item.coverUrl ?? null,
      item.category,
      Number(item.releaseYear) || new Date().getFullYear(),
      mysqlDate(item.addedAt),
      item.notificationEnabled ?? true,
      JSON.stringify(item.notificationPreferences ?? defaultWishlistPreferences)
    ]
  );
}

async function upsertReport(pool: mysql.Pool, report: ProblemReport) {
  await pool.execute(
    `INSERT INTO problem_reports
      (id, numeric_id, category, description, screenshot, page_url, user_agent, viewport, user_sub, user_email,
       user_name, created_at, resolved, resolved_at, resolved_by, feedback_message, feedback_sent_at, feedback_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE numeric_id = VALUES(numeric_id), category = VALUES(category),
       description = VALUES(description), screenshot = VALUES(screenshot), page_url = VALUES(page_url),
       user_agent = VALUES(user_agent), viewport = VALUES(viewport), user_sub = VALUES(user_sub),
       user_email = VALUES(user_email), user_name = VALUES(user_name), created_at = VALUES(created_at),
       resolved = VALUES(resolved), resolved_at = VALUES(resolved_at), resolved_by = VALUES(resolved_by),
       feedback_message = VALUES(feedback_message), feedback_sent_at = VALUES(feedback_sent_at),
       feedback_by = VALUES(feedback_by)`,
    [
      report.id,
      report.numericId ?? null,
      report.category,
      report.description,
      report.screenshot ?? null,
      report.pageUrl,
      report.userAgent,
      report.viewport,
      report.userSub ?? null,
      report.userEmail ?? null,
      report.userName ?? null,
      mysqlDate(report.createdAt),
      report.resolved ?? false,
      maybeMysqlDate(report.resolvedAt),
      report.resolvedBy ?? null,
      report.feedbackMessage ?? null,
      maybeMysqlDate(report.feedbackSentAt),
      report.feedbackBy ?? null
    ]
  );
}

async function upsertPostgresUser(sql: NeonSql, userId: string, user: StoredUser) {
  await sql.query(
    `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture,
       notification_settings = EXCLUDED.notification_settings, updated_at = EXCLUDED.updated_at`,
    [
      user.sub || userId,
      user.email ?? "",
      user.name ?? "Usuario",
      user.picture ?? null,
      JSON.stringify(user.notificationSettings ?? defaultNotificationSettings),
      mysqlDate(user.createdAt),
      mysqlDate(user.updatedAt)
    ]
  );
}

async function ensurePostgresUserPlaceholder(sql: NeonSql, userId: string) {
  const now = mysqlDate(new Date().toISOString());
  await sql.query(
    `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
     VALUES ($1, '', 'Usuario', NULL, $2::jsonb, $3, $4)
     ON CONFLICT (sub) DO NOTHING`,
    [userId, JSON.stringify(defaultNotificationSettings), now, now]
  );
}

async function upsertPostgresWishlistItem(sql: NeonSql, userId: string, item: StoredWishlistItem) {
  await sql.query(
    `INSERT INTO wishlist_items
      (user_sub, game_id, title, cover_url, category, release_year, added_at, notification_enabled, notification_preferences)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (user_sub, game_id) DO UPDATE SET title = EXCLUDED.title, cover_url = EXCLUDED.cover_url,
       category = EXCLUDED.category, release_year = EXCLUDED.release_year, notification_enabled = EXCLUDED.notification_enabled,
       notification_preferences = EXCLUDED.notification_preferences`,
    [
      userId,
      item.gameId,
      item.title,
      item.coverUrl ?? null,
      item.category,
      Number(item.releaseYear) || new Date().getFullYear(),
      mysqlDate(item.addedAt),
      item.notificationEnabled ?? true,
      JSON.stringify(item.notificationPreferences ?? defaultWishlistPreferences)
    ]
  );
}

async function upsertPostgresReport(sql: NeonSql, report: ProblemReport) {
  await sql.query(
    `INSERT INTO problem_reports
      (id, numeric_id, category, description, screenshot, page_url, user_agent, viewport, user_sub, user_email,
       user_name, created_at, resolved, resolved_at, resolved_by, feedback_message, feedback_sent_at, feedback_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (id) DO UPDATE SET numeric_id = EXCLUDED.numeric_id, category = EXCLUDED.category,
       description = EXCLUDED.description, screenshot = EXCLUDED.screenshot, page_url = EXCLUDED.page_url,
       user_agent = EXCLUDED.user_agent, viewport = EXCLUDED.viewport, user_sub = EXCLUDED.user_sub,
       user_email = EXCLUDED.user_email, user_name = EXCLUDED.user_name, created_at = EXCLUDED.created_at,
       resolved = EXCLUDED.resolved, resolved_at = EXCLUDED.resolved_at, resolved_by = EXCLUDED.resolved_by,
       feedback_message = EXCLUDED.feedback_message, feedback_sent_at = EXCLUDED.feedback_sent_at,
       feedback_by = EXCLUDED.feedback_by`,
    [
      report.id,
      report.numericId ?? null,
      report.category,
      report.description,
      report.screenshot ?? null,
      report.pageUrl,
      report.userAgent,
      report.viewport,
      report.userSub ?? null,
      report.userEmail ?? null,
      report.userName ?? null,
      mysqlDate(report.createdAt),
      report.resolved ?? false,
      maybeMysqlDate(report.resolvedAt),
      report.resolvedBy ?? null,
      report.feedbackMessage ?? null,
      maybeMysqlDate(report.feedbackSentAt),
      report.feedbackBy ?? null
    ]
  );
}

function mysqlConfig(): mysql.PoolOptions {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 5),
      ssl: process.env.MYSQL_SSL === "1" ? { rejectUnauthorized: false } : undefined
    };
  }

  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) {
    throw new Error("Missing database config. Set DATABASE_URL or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.");
  }

  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 5),
    ssl: process.env.MYSQL_SSL === "1" ? { rejectUnauthorized: false } : undefined
  };
}

function hasPostgresConfig(): boolean {
  return Boolean(postgresConnectionString(false));
}

function postgresConnectionString(required = true): string {
  const value = process.env.POSTGRES_URL || (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : "");
  if (!value && required) throw new Error("Missing Postgres config. Set POSTGRES_URL or a postgres DATABASE_URL.");
  return value;
}

function maybeMysqlDate(value: string | null | undefined): string | null {
  return value ? mysqlDate(value) : null;
}

function mysqlDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return date.toISOString().slice(0, 19).replace("T", " ");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
