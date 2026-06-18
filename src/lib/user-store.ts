import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import mysql from "mysql2/promise";
import type { GameCategory, StoreId } from "./types";
import { STORES } from "./types";

export type StoredUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  updatedAt: string;
  notificationSettings: NotificationSettings;
};

export type NotificationSettings = {
  email: boolean;
  webPush: boolean;
  discord: boolean;
  enabledStores: StoreId[];
};

export type WishlistNotificationPreferences = {
  priceDrop: boolean;
  historicalLow: boolean;
  belowUsd: boolean;
  belowUsdValue: number | null;
};

export type StoredWishlistItem = {
  gameId: string;
  title: string;
  coverUrl?: string | null;
  category: GameCategory | string;
  releaseYear: number;
  addedAt: string;
  notificationEnabled: boolean;
  notificationPreferences: WishlistNotificationPreferences;
};

type UserDb = {
  users: Record<string, StoredUser>;
  wishlists: Record<string, StoredWishlistItem[]>;
};

type UserStoreAdapter = {
  upsertUser(input: Pick<StoredUser, "sub" | "email" | "name" | "picture">): Promise<StoredUser>;
  getNotificationSettings(userId: string): Promise<NotificationSettings>;
  updateNotificationSettings(userId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings>;
  getWishlist(userId: string): Promise<StoredWishlistItem[]>;
  getAllUsersWithWishlists(): Promise<Array<{ user: StoredUser; wishlist: StoredWishlistItem[] }>>;
  upsertWishlistItem(
    userId: string,
    item: Omit<StoredWishlistItem, "addedAt" | "notificationEnabled" | "notificationPreferences">
  ): Promise<StoredWishlistItem[]>;
  updateWishlistItem(
    userId: string,
    gameId: string,
    updates: Partial<Pick<StoredWishlistItem, "notificationEnabled" | "notificationPreferences">>
  ): Promise<StoredWishlistItem[]>;
  removeWishlistItem(userId: string, gameId: string): Promise<StoredWishlistItem[]>;
};

const DATA_PATH = path.join(process.cwd(), "data", "generated", "users.json");

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  email: false,
  webPush: false,
  discord: false,
  enabledStores: [...STORES]
};

export const DEFAULT_WISHLIST_PREFERENCES: WishlistNotificationPreferences = {
  priceDrop: true,
  historicalLow: false,
  belowUsd: false,
  belowUsdValue: null
};

const adapter: UserStoreAdapter = createAdapter();

export function userStoreBackend(): "postgres" | "mysql" | "json" {
  if (hasPostgresConfig()) return "postgres";
  if (hasMysqlConfig()) return "mysql";
  return "json";
}

export function upsertUser(input: Pick<StoredUser, "sub" | "email" | "name" | "picture">): Promise<StoredUser> {
  return adapter.upsertUser(input);
}

export function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  return adapter.getNotificationSettings(userId);
}

export function updateNotificationSettings(userId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  return adapter.updateNotificationSettings(userId, settings);
}

export function getWishlist(userId: string): Promise<StoredWishlistItem[]> {
  return adapter.getWishlist(userId);
}

export function getAllUsersWithWishlists(): Promise<Array<{ user: StoredUser; wishlist: StoredWishlistItem[] }>> {
  return adapter.getAllUsersWithWishlists();
}

export function upsertWishlistItem(
  userId: string,
  item: Omit<StoredWishlistItem, "addedAt" | "notificationEnabled" | "notificationPreferences">
): Promise<StoredWishlistItem[]> {
  return adapter.upsertWishlistItem(userId, item);
}

export function updateWishlistItem(
  userId: string,
  gameId: string,
  updates: Partial<Pick<StoredWishlistItem, "notificationEnabled" | "notificationPreferences">>
): Promise<StoredWishlistItem[]> {
  return adapter.updateWishlistItem(userId, gameId, updates);
}

export function removeWishlistItem(userId: string, gameId: string): Promise<StoredWishlistItem[]> {
  return adapter.removeWishlistItem(userId, gameId);
}

function createAdapter(): UserStoreAdapter {
  if (hasPostgresConfig()) return createPostgresAdapter();
  if (hasMysqlConfig()) return createMysqlAdapter();
  return createJsonAdapter();
}

function createPostgresAdapter(): UserStoreAdapter {
  const sql = neon(postgresConnectionString());
  let initialized = false;

  async function ensureSchema(): Promise<void> {
    if (initialized) return;
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
    initialized = true;
  }

  return {
    async upsertUser(input) {
      await ensureSchema();
      const now = new Date().toISOString();
      const existing = await getPostgresUser(input.sub);
      const notificationSettings = existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
      await sql.query(
        `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture,
           notification_settings = EXCLUDED.notification_settings, updated_at = EXCLUDED.updated_at`,
        [input.sub, input.email, input.name, input.picture ?? null, JSON.stringify(notificationSettings), existing?.createdAt ?? now, now]
      );
      return {
        sub: input.sub,
        email: input.email,
        name: input.name,
        picture: input.picture,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        notificationSettings
      };
    },

    async getNotificationSettings(userId) {
      await ensureSchema();
      return (await getPostgresUser(userId))?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
    },

    async updateNotificationSettings(userId, settings) {
      await ensureSchema();
      const existing = await getPostgresUser(userId);
      const nextSettings = normalizeNotificationSettings({ ...(existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS), ...settings });
      if (existing) {
        await sql.query("UPDATE users SET notification_settings = $1::jsonb, updated_at = $2 WHERE sub = $3", [
          JSON.stringify(nextSettings),
          new Date().toISOString(),
          userId
        ]);
      }
      return nextSettings;
    },

    async getWishlist(userId) {
      await ensureSchema();
      return getPostgresWishlist(userId);
    },

    async getAllUsersWithWishlists() {
      await ensureSchema();
      const userRows = await sql.query("SELECT * FROM users");
      const users = userRows.map(postgresUserFromRow);
      const result: Array<{ user: StoredUser; wishlist: StoredWishlistItem[] }> = [];
      for (const user of users) result.push({ user, wishlist: await getPostgresWishlist(user.sub) });
      return result;
    },

    async upsertWishlistItem(userId, item) {
      await ensureSchema();
      await ensurePostgresUserPlaceholder(userId);
      const existing = (await getPostgresWishlist(userId)).find((entry) => entry.gameId === item.gameId);
      const nextItem: StoredWishlistItem = {
        ...existing,
        ...item,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        notificationEnabled: existing?.notificationEnabled ?? true,
        notificationPreferences: existing?.notificationPreferences ?? DEFAULT_WISHLIST_PREFERENCES
      };
      await sql.query(
        `INSERT INTO wishlist_items
          (user_sub, game_id, title, cover_url, category, release_year, added_at, notification_enabled, notification_preferences)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (user_sub, game_id) DO UPDATE SET title = EXCLUDED.title, cover_url = EXCLUDED.cover_url,
           category = EXCLUDED.category, release_year = EXCLUDED.release_year,
           notification_enabled = EXCLUDED.notification_enabled, notification_preferences = EXCLUDED.notification_preferences`,
        [
          userId,
          nextItem.gameId,
          nextItem.title,
          nextItem.coverUrl ?? null,
          nextItem.category,
          nextItem.releaseYear,
          nextItem.addedAt,
          nextItem.notificationEnabled,
          JSON.stringify(nextItem.notificationPreferences)
        ]
      );
      return getPostgresWishlist(userId);
    },

    async updateWishlistItem(userId, gameId, updates) {
      await ensureSchema();
      const existing = (await getPostgresWishlist(userId)).find((entry) => entry.gameId === gameId);
      if (!existing) return getPostgresWishlist(userId);
      const nextPreferences = updates.notificationPreferences
        ? normalizeWishlistPreferences({ ...existing.notificationPreferences, ...updates.notificationPreferences })
        : existing.notificationPreferences;
      await sql.query("UPDATE wishlist_items SET notification_enabled = $1, notification_preferences = $2::jsonb WHERE user_sub = $3 AND game_id = $4", [
        updates.notificationEnabled ?? existing.notificationEnabled,
        JSON.stringify(nextPreferences),
        userId,
        gameId
      ]);
      return getPostgresWishlist(userId);
    },

    async removeWishlistItem(userId, gameId) {
      await ensureSchema();
      await sql.query("DELETE FROM wishlist_items WHERE user_sub = $1 AND game_id = $2", [userId, gameId]);
      return getPostgresWishlist(userId);
    }
  };

  async function getPostgresUser(userId: string): Promise<StoredUser | null> {
    const rows = await sql.query("SELECT * FROM users WHERE sub = $1 LIMIT 1", [userId]);
    return rows[0] ? postgresUserFromRow(rows[0]) : null;
  }

  async function ensurePostgresUserPlaceholder(userId: string): Promise<void> {
    if (await getPostgresUser(userId)) return;
    const now = new Date().toISOString();
    await sql.query(
      `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
       VALUES ($1, '', 'Usuario', NULL, $2::jsonb, $3, $4)
       ON CONFLICT (sub) DO NOTHING`,
      [userId, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, now]
    );
  }

  async function getPostgresWishlist(userId: string): Promise<StoredWishlistItem[]> {
    const rows = await sql.query("SELECT * FROM wishlist_items WHERE user_sub = $1 ORDER BY added_at DESC", [userId]);
    return rows.map(postgresWishlistFromRow);
  }
}

function createMysqlAdapter(): UserStoreAdapter {
  let pool: mysql.Pool | null = null;
  let initialized = false;

  function getPool(): mysql.Pool {
    if (pool) return pool;
    pool = mysql.createPool(mysqlConfig());
    return pool;
  }

  async function ensureSchema(): Promise<void> {
    if (initialized) return;
    const db = getPool();
    await db.query(`
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
    await db.query(`
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
    initialized = true;
  }

  return {
    async upsertUser(input) {
      await ensureSchema();
      const now = new Date();
      const existing = await getMysqlUser(input.sub);
      const notificationSettings = existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
      await getPool().execute(
        `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), picture = VALUES(picture),
           notification_settings = VALUES(notification_settings), updated_at = VALUES(updated_at)`,
        [input.sub, input.email, input.name, input.picture ?? null, JSON.stringify(notificationSettings), existing?.createdAt ?? now, now]
      );
      return {
        sub: input.sub,
        email: input.email,
        name: input.name,
        picture: input.picture,
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
        notificationSettings
      };
    },

    async getNotificationSettings(userId) {
      await ensureSchema();
      return (await getMysqlUser(userId))?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
    },

    async updateNotificationSettings(userId, settings) {
      await ensureSchema();
      const existing = await getMysqlUser(userId);
      const nextSettings = normalizeNotificationSettings({ ...(existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS), ...settings });
      if (existing) {
        await getPool().execute("UPDATE users SET notification_settings = ?, updated_at = ? WHERE sub = ?", [
          JSON.stringify(nextSettings),
          new Date(),
          userId
        ]);
      }
      return nextSettings;
    },

    async getWishlist(userId) {
      await ensureSchema();
      return getMysqlWishlist(userId);
    },

    async getAllUsersWithWishlists() {
      await ensureSchema();
      const [userRows] = await getPool().query<mysql.RowDataPacket[]>("SELECT * FROM users");
      const users = userRows.map(mysqlUserFromRow);
      const result: Array<{ user: StoredUser; wishlist: StoredWishlistItem[] }> = [];
      for (const user of users) result.push({ user, wishlist: await getMysqlWishlist(user.sub) });
      return result;
    },

    async upsertWishlistItem(userId, item) {
      await ensureSchema();
      await ensureMysqlUserPlaceholder(userId);
      const existing = (await getMysqlWishlist(userId)).find((entry) => entry.gameId === item.gameId);
      const nextItem: StoredWishlistItem = {
        ...existing,
        ...item,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        notificationEnabled: existing?.notificationEnabled ?? true,
        notificationPreferences: existing?.notificationPreferences ?? DEFAULT_WISHLIST_PREFERENCES
      };
      await getPool().execute(
        `INSERT INTO wishlist_items
          (user_sub, game_id, title, cover_url, category, release_year, added_at, notification_enabled, notification_preferences)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), cover_url = VALUES(cover_url), category = VALUES(category),
           release_year = VALUES(release_year), notification_enabled = VALUES(notification_enabled),
           notification_preferences = VALUES(notification_preferences)`,
        [
          userId,
          nextItem.gameId,
          nextItem.title,
          nextItem.coverUrl ?? null,
          nextItem.category,
          nextItem.releaseYear,
          new Date(nextItem.addedAt),
          nextItem.notificationEnabled,
          JSON.stringify(nextItem.notificationPreferences)
        ]
      );
      return getMysqlWishlist(userId);
    },

    async updateWishlistItem(userId, gameId, updates) {
      await ensureSchema();
      const existing = (await getMysqlWishlist(userId)).find((entry) => entry.gameId === gameId);
      if (!existing) return getMysqlWishlist(userId);
      const nextPreferences = updates.notificationPreferences
        ? normalizeWishlistPreferences({ ...existing.notificationPreferences, ...updates.notificationPreferences })
        : existing.notificationPreferences;
      await getPool().execute(
        "UPDATE wishlist_items SET notification_enabled = ?, notification_preferences = ? WHERE user_sub = ? AND game_id = ?",
        [updates.notificationEnabled ?? existing.notificationEnabled, JSON.stringify(nextPreferences), userId, gameId]
      );
      return getMysqlWishlist(userId);
    },

    async removeWishlistItem(userId, gameId) {
      await ensureSchema();
      await getPool().execute("DELETE FROM wishlist_items WHERE user_sub = ? AND game_id = ?", [userId, gameId]);
      return getMysqlWishlist(userId);
    }
  };

  async function getMysqlUser(userId: string): Promise<StoredUser | null> {
    const [rows] = await getPool().execute<mysql.RowDataPacket[]>("SELECT * FROM users WHERE sub = ? LIMIT 1", [userId]);
    return rows[0] ? mysqlUserFromRow(rows[0]) : null;
  }

  async function ensureMysqlUserPlaceholder(userId: string): Promise<void> {
    if (await getMysqlUser(userId)) return;
    const now = new Date();
    await getPool().execute(
      `INSERT INTO users (sub, email, name, picture, notification_settings, created_at, updated_at)
       VALUES (?, '', 'Usuario', NULL, ?, ?, ?)`,
      [userId, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, now]
    );
  }

  async function getMysqlWishlist(userId: string): Promise<StoredWishlistItem[]> {
    const [rows] = await getPool().execute<mysql.RowDataPacket[]>(
      "SELECT * FROM wishlist_items WHERE user_sub = ? ORDER BY added_at DESC",
      [userId]
    );
    return rows.map(mysqlWishlistFromRow);
  }
}

function createJsonAdapter(): UserStoreAdapter {
  return {
    async upsertUser(input) {
      const db = await readDb();
      const now = new Date().toISOString();
      const existing = db.users[input.sub];
      const user: StoredUser = {
        ...existing,
        sub: input.sub,
        email: input.email,
        name: input.name,
        picture: input.picture,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        notificationSettings: existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS
      };
      db.users[input.sub] = user;
      await writeDb(db);
      return user;
    },

    async getNotificationSettings(userId) {
      const db = await readDb();
      return db.users[userId]?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
    },

    async updateNotificationSettings(userId, settings) {
      const db = await readDb();
      const existing = db.users[userId];
      const nextSettings = normalizeNotificationSettings({ ...(existing?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS), ...settings });
      if (existing) {
        db.users[userId] = {
          ...existing,
          notificationSettings: nextSettings,
          updatedAt: new Date().toISOString()
        };
      }
      await writeDb(db);
      return nextSettings;
    },

    async getWishlist(userId) {
      const db = await readDb();
      return getWishlistFromDb(db, userId);
    },

    async getAllUsersWithWishlists() {
      const db = await readDb();
      const userIds = new Set([...Object.keys(db.users), ...Object.keys(db.wishlists)]);
      return [...userIds].map((userId) => ({
        user:
          db.users[userId] ??
          ({
            sub: userId,
            email: "",
            name: "Usuario",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            notificationSettings: DEFAULT_NOTIFICATION_SETTINGS
          } satisfies StoredUser),
        wishlist: getWishlistFromDb(db, userId)
      }));
    },

    async upsertWishlistItem(userId, item) {
      const db = await readDb();
      const current = db.wishlists[userId] ?? [];
      const existing = current.find((entry) => entry.gameId === item.gameId);
      const nextItem: StoredWishlistItem = {
        ...existing,
        ...item,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        notificationEnabled: existing?.notificationEnabled ?? true,
        notificationPreferences: existing?.notificationPreferences ?? DEFAULT_WISHLIST_PREFERENCES
      };
      db.wishlists[userId] = [nextItem, ...current.filter((entry) => entry.gameId !== item.gameId)];
      await writeDb(db);
      return getWishlistFromDb(db, userId);
    },

    async updateWishlistItem(userId, gameId, updates) {
      const db = await readDb();
      const current = db.wishlists[userId] ?? [];
      db.wishlists[userId] = current.map((item) =>
        item.gameId === gameId
          ? {
              ...item,
              notificationEnabled: updates.notificationEnabled ?? item.notificationEnabled,
              notificationPreferences: updates.notificationPreferences
                ? normalizeWishlistPreferences({ ...item.notificationPreferences, ...updates.notificationPreferences })
                : item.notificationPreferences
            }
          : item
      );
      await writeDb(db);
      return getWishlistFromDb(db, userId);
    },

    async removeWishlistItem(userId, gameId) {
      const db = await readDb();
      db.wishlists[userId] = (db.wishlists[userId] ?? []).filter((item) => item.gameId !== gameId);
      await writeDb(db);
      return getWishlistFromDb(db, userId);
    }
  };
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

function mysqlUserFromRow(row: mysql.RowDataPacket): StoredUser {
  return {
    sub: String(row.sub),
    email: String(row.email ?? ""),
    name: String(row.name ?? "Usuario"),
    picture: row.picture ? String(row.picture) : undefined,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at),
    notificationSettings: normalizeNotificationSettings(parseJson(row.notification_settings, DEFAULT_NOTIFICATION_SETTINGS))
  };
}

function mysqlWishlistFromRow(row: mysql.RowDataPacket): StoredWishlistItem {
  return {
    gameId: String(row.game_id),
    title: String(row.title),
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    category: String(row.category),
    releaseYear: Number(row.release_year) || new Date().getFullYear(),
    addedAt: dateIso(row.added_at),
    notificationEnabled: Boolean(row.notification_enabled),
    notificationPreferences: normalizeWishlistPreferences(parseJson(row.notification_preferences, DEFAULT_WISHLIST_PREFERENCES))
  };
}

function postgresUserFromRow(row: Record<string, unknown>): StoredUser {
  return {
    sub: String(row.sub),
    email: String(row.email ?? ""),
    name: String(row.name ?? "Usuario"),
    picture: row.picture ? String(row.picture) : undefined,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at),
    notificationSettings: normalizeNotificationSettings(parseJson(row.notification_settings, DEFAULT_NOTIFICATION_SETTINGS))
  };
}

function postgresWishlistFromRow(row: Record<string, unknown>): StoredWishlistItem {
  return {
    gameId: String(row.game_id),
    title: String(row.title),
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    category: String(row.category),
    releaseYear: Number(row.release_year) || new Date().getFullYear(),
    addedAt: dateIso(row.added_at),
    notificationEnabled: Boolean(row.notification_enabled),
    notificationPreferences: normalizeWishlistPreferences(parseJson(row.notification_preferences, DEFAULT_WISHLIST_PREFERENCES))
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function dateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hasPostgresConfig(): boolean {
  return Boolean(postgresConnectionString(false));
}

function hasMysqlConfig(): boolean {
  return Boolean(process.env.MYSQL_HOST || process.env.DATABASE_URL?.startsWith("mysql://") || process.env.DATABASE_URL?.startsWith("mysql2://"));
}

function postgresConnectionString(required = true): string {
  const value = process.env.POSTGRES_URL || (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : "");
  if (!value && required) throw new Error("Missing Postgres config. Set POSTGRES_URL or a postgres DATABASE_URL.");
  return value;
}

function normalizeNotificationSettings(settings: Partial<NotificationSettings>): NotificationSettings {
  const enabledStores = settings.enabledStores?.filter((store): store is StoreId => STORES.includes(store as StoreId));
  return {
    email: Boolean(settings.email),
    webPush: Boolean(settings.webPush),
    discord: Boolean(settings.discord),
    enabledStores: enabledStores?.length ? enabledStores : [...STORES]
  };
}

function normalizeWishlistPreferences(settings: Partial<WishlistNotificationPreferences>): WishlistNotificationPreferences {
  return {
    priceDrop: settings.priceDrop ?? DEFAULT_WISHLIST_PREFERENCES.priceDrop,
    historicalLow: settings.historicalLow ?? DEFAULT_WISHLIST_PREFERENCES.historicalLow,
    belowUsd: settings.belowUsd ?? DEFAULT_WISHLIST_PREFERENCES.belowUsd,
    belowUsdValue: typeof settings.belowUsdValue === "number" && Number.isFinite(settings.belowUsdValue) ? settings.belowUsdValue : null
  };
}

async function readDb(): Promise<UserDb> {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserDb>;
    return {
      users: parsed.users ?? {},
      wishlists: parsed.wishlists ?? {}
    };
  } catch {
    return { users: {}, wishlists: {} };
  }
}

async function writeDb(db: UserDb): Promise<void> {
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function getWishlistFromDb(db: UserDb, userId: string): StoredWishlistItem[] {
  return [...(db.wishlists[userId] ?? [])].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
}
