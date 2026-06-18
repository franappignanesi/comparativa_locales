import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import mysql from "mysql2/promise";

export type ProblemReportCategory = "Precios mal cargados" | "Funcion rota" | "Bug visual" | "Otro";

export type ProblemReport = {
  id: string;
  numericId: number;
  category: ProblemReportCategory;
  description: string;
  screenshot: string | null;
  pageUrl: string;
  userAgent: string;
  viewport: string;
  userSub: string | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  feedbackMessage: string | null;
  feedbackSentAt: string | null;
  feedbackBy: string | null;
};

type ProblemReportInput = Omit<
  ProblemReport,
  "id" | "numericId" | "createdAt" | "resolved" | "resolvedAt" | "resolvedBy" | "feedbackMessage" | "feedbackSentAt" | "feedbackBy"
>;
type StoredProblemReport = ProblemReportInput & {
  id: string;
  numericId?: number;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  feedbackMessage?: string | null;
  feedbackSentAt?: string | null;
  feedbackBy?: string | null;
};

type ReportDb = {
  reports: StoredProblemReport[];
};

type ReportStoreAdapter = {
  create(input: ProblemReportInput): Promise<ProblemReport>;
  list(): Promise<ProblemReport[]>;
  updateResolved(id: string, adminEmail: string, resolved: boolean, feedbackMessage?: string | null): Promise<ProblemReport | null>;
  listFeedbackForUser(userId: string | null, email: string | null): Promise<ProblemReport[]>;
  countForUserSince(userId: string, sinceIso: string): Promise<number>;
};

const REPORTS_PATH = path.join(process.cwd(), "data", "generated", "problem-reports.json");
const adapter: ReportStoreAdapter = createAdapter();

export function createProblemReport(input: ProblemReportInput): Promise<ProblemReport> {
  return adapter.create(input);
}

export function listProblemReports(): Promise<ProblemReport[]> {
  return adapter.list();
}

export function updateProblemReportStatus(id: string, adminEmail: string, resolved: boolean, feedbackMessage?: string | null): Promise<ProblemReport | null> {
  return adapter.updateResolved(id, adminEmail, resolved, feedbackMessage);
}

export function listProblemReportFeedbackForUser(userId: string | null, email: string | null): Promise<ProblemReport[]> {
  return adapter.listFeedbackForUser(userId, email);
}

export function countProblemReportsForUserSince(userId: string, sinceIso: string): Promise<number> {
  return adapter.countForUserSince(userId, sinceIso);
}

function createAdapter(): ReportStoreAdapter {
  if (hasPostgresConfig()) return createPostgresAdapter();
  if (hasMysqlConfig()) return createMysqlAdapter();
  return createJsonAdapter();
}

function createPostgresAdapter(): ReportStoreAdapter {
  const sql = neon(postgresConnectionString());
  let initialized = false;

  async function ensureTables(): Promise<void> {
    if (initialized) return;
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
    initialized = true;
  }

  return {
    async create(input) {
      await ensureTables();
      const report = buildReport(input, await nextPostgresNumericId());
      await sql.query(
        `INSERT INTO problem_reports
          (id, numeric_id, category, description, screenshot, page_url, user_agent, viewport, user_sub, user_email, user_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          report.id,
          report.numericId,
          report.category,
          report.description,
          report.screenshot,
          report.pageUrl,
          report.userAgent,
          report.viewport,
          report.userSub,
          report.userEmail,
          report.userName,
          report.createdAt
        ]
      );
      return report;
    },
    async list() {
      await ensureTables();
      const rows = await sql.query("SELECT * FROM problem_reports ORDER BY created_at DESC LIMIT 500");
      return rows.map(postgresReportFromRow);
    },
    async updateResolved(id, adminEmail, resolved, feedbackMessage) {
      await ensureTables();
      const resolvedAt = resolved ? new Date().toISOString() : null;
      const message = resolved && feedbackMessage ? feedbackMessage.trim().slice(0, 2000) : null;
      await sql.query(
        `UPDATE problem_reports
         SET resolved = $1, resolved_at = $2, resolved_by = $3, feedback_message = $4, feedback_sent_at = $5, feedback_by = $6
         WHERE id = $7`,
        [resolved, resolvedAt, resolved ? adminEmail : null, message, message ? new Date().toISOString() : null, message ? adminEmail : null, id]
      );
      const rows = await sql.query("SELECT * FROM problem_reports WHERE id = $1 LIMIT 1", [id]);
      return rows[0] ? postgresReportFromRow(rows[0]) : null;
    },
    async listFeedbackForUser(userId, email) {
      await ensureTables();
      if (!userId && !email) return [];
      const rows = await sql.query(
        `SELECT * FROM problem_reports
         WHERE feedback_message IS NOT NULL AND (($1::text IS NOT NULL AND user_sub = $2) OR ($3::text IS NOT NULL AND user_email = $4))
         ORDER BY feedback_sent_at DESC LIMIT 20`,
        [userId, userId, email, email]
      );
      return rows.map(postgresReportFromRow);
    },
    async countForUserSince(userId, sinceIso) {
      await ensureTables();
      const rows = await sql.query("SELECT COUNT(*) AS count FROM problem_reports WHERE user_sub = $1 AND created_at >= $2", [userId, sinceIso]);
      return Number(rows[0]?.count ?? 0);
    }
  };

  async function nextPostgresNumericId(): Promise<number> {
    const rows = await sql.query("SELECT COALESCE(MAX(numeric_id), 0) + 1 AS next_id FROM problem_reports");
    return Number(rows[0]?.next_id ?? 1);
  }
}

function createMysqlAdapter(): ReportStoreAdapter {
  let pool: mysql.Pool | null = null;
  let initialized = false;

  function getPool(): mysql.Pool {
    pool ??= mysql.createPool(mysqlConfig());
    return pool;
  }

  async function ensureTables(): Promise<void> {
    if (initialized) return;
    await getPool().query(`
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
      )
    `);
    await addColumnIfMissing("problem_reports", "numeric_id", "BIGINT NULL");
    await addColumnIfMissing("problem_reports", "user_sub", "VARCHAR(191) NULL");
    await addColumnIfMissing("problem_reports", "resolved", "BOOLEAN NOT NULL DEFAULT FALSE");
    await addColumnIfMissing("problem_reports", "resolved_at", "DATETIME NULL");
    await addColumnIfMissing("problem_reports", "resolved_by", "VARCHAR(191) NULL");
    await addColumnIfMissing("problem_reports", "feedback_message", "TEXT NULL");
    await addColumnIfMissing("problem_reports", "feedback_sent_at", "DATETIME NULL");
    await addColumnIfMissing("problem_reports", "feedback_by", "VARCHAR(191) NULL");
    initialized = true;
  }

  async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    try {
      await getPool().query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch {
      // Existing installs may already have the column; keep boot resilient.
    }
  }

  return {
    async create(input) {
      await ensureTables();
      const report = buildReport(input, await nextMysqlNumericId());
      await getPool().execute(
        `INSERT INTO problem_reports
          (id, numeric_id, category, description, screenshot, page_url, user_agent, viewport, user_sub, user_email, user_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report.id,
          report.numericId,
          report.category,
          report.description,
          report.screenshot,
          report.pageUrl,
          report.userAgent,
          report.viewport,
          report.userSub,
          report.userEmail,
          report.userName,
          mysqlDate(report.createdAt)
        ]
      );
      return report;
    },
    async list() {
      await ensureTables();
      const [rows] = await getPool().query<mysql.RowDataPacket[]>("SELECT * FROM problem_reports ORDER BY created_at DESC LIMIT 500");
      return rows.map(mysqlReportFromRow);
    },
    async updateResolved(id, adminEmail, resolved, feedbackMessage) {
      await ensureTables();
      const resolvedAt = resolved ? new Date().toISOString() : null;
      const message = resolved && feedbackMessage ? feedbackMessage.trim().slice(0, 2000) : null;
      await getPool().execute(
        `UPDATE problem_reports
         SET resolved = ?, resolved_at = ?, resolved_by = ?, feedback_message = ?, feedback_sent_at = ?, feedback_by = ?
         WHERE id = ?`,
        [
          resolved,
          resolvedAt ? mysqlDate(resolvedAt) : null,
          resolved ? adminEmail : null,
          message,
          message ? mysqlDate(new Date().toISOString()) : null,
          message ? adminEmail : null,
          id
        ]
      );
      const [rows] = await getPool().query<mysql.RowDataPacket[]>("SELECT * FROM problem_reports WHERE id = ? LIMIT 1", [id]);
      return rows[0] ? mysqlReportFromRow(rows[0]) : null;
    },
    async listFeedbackForUser(userId, email) {
      await ensureTables();
      if (!userId && !email) return [];
      const [rows] = await getPool().query<mysql.RowDataPacket[]>(
        `SELECT * FROM problem_reports
         WHERE feedback_message IS NOT NULL AND ((? IS NOT NULL AND user_sub = ?) OR (? IS NOT NULL AND user_email = ?))
         ORDER BY feedback_sent_at DESC LIMIT 20`,
        [userId, userId, email, email]
      );
      return rows.map(mysqlReportFromRow);
    },
    async countForUserSince(userId, sinceIso) {
      await ensureTables();
      const [rows] = await getPool().query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM problem_reports WHERE user_sub = ? AND created_at >= ?",
        [userId, mysqlDate(sinceIso)]
      );
      return Number(rows[0]?.count ?? 0);
    }
  };

  async function nextMysqlNumericId(): Promise<number> {
    const [rows] = await getPool().query<mysql.RowDataPacket[]>("SELECT COALESCE(MAX(numeric_id), 0) + 1 AS next_id FROM problem_reports");
    return Number(rows[0]?.next_id ?? 1);
  }

  function mysqlReportFromRow(row: mysql.RowDataPacket): ProblemReport {
    return normalizeReport({
        id: String(row.id),
        numericId: Number(row.numeric_id ?? deriveNumericId(String(row.id))),
        category: row.category,
        description: row.description,
        screenshot: row.screenshot,
        pageUrl: row.page_url,
        userAgent: row.user_agent,
        viewport: row.viewport,
        userSub: row.user_sub ?? null,
        userEmail: row.user_email,
        userName: row.user_name,
        createdAt: new Date(row.created_at).toISOString(),
        resolved: Boolean(row.resolved),
        resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        resolvedBy: row.resolved_by ?? null,
        feedbackMessage: row.feedback_message ?? null,
        feedbackSentAt: row.feedback_sent_at ? new Date(row.feedback_sent_at).toISOString() : null,
        feedbackBy: row.feedback_by ?? null
      });
  }
}

function createJsonAdapter(): ReportStoreAdapter {
  return {
    async create(input) {
      const db = await readDb();
      const report = buildReport(input, nextJsonNumericId(db));
      db.reports = [report, ...db.reports].slice(0, 1000);
      await writeDb(db);
      return report;
    },
    async list() {
      const db = await readDb();
      return db.reports.map(normalizeReport).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
    async updateResolved(id, adminEmail, resolved, feedbackMessage) {
      const db = await readDb();
      const now = new Date().toISOString();
      const message = resolved && feedbackMessage ? feedbackMessage.trim().slice(0, 2000) : null;
      let updated: ProblemReport | null = null;
      db.reports = db.reports.map((report) => {
        if (report.id !== id) return normalizeReport(report);
        updated = normalizeReport({
          ...report,
          resolved,
          resolvedAt: resolved ? now : null,
          resolvedBy: resolved ? adminEmail : null,
          feedbackMessage: message,
          feedbackSentAt: message ? now : null,
          feedbackBy: message ? adminEmail : null
        });
        return updated;
      });
      await writeDb(db);
      return updated;
    },
    async listFeedbackForUser(userId, email) {
      const db = await readDb();
      return db.reports
        .map(normalizeReport)
        .filter((report) => Boolean(report.feedbackMessage) && ((userId && report.userSub === userId) || (email && report.userEmail === email)))
        .sort((a, b) => Date.parse(b.feedbackSentAt ?? b.resolvedAt ?? b.createdAt) - Date.parse(a.feedbackSentAt ?? a.resolvedAt ?? a.createdAt))
        .slice(0, 20);
    },
    async countForUserSince(userId, sinceIso) {
      const since = Date.parse(sinceIso);
      const db = await readDb();
      return db.reports.filter((report) => report.userSub === userId && Date.parse(report.createdAt) >= since).length;
    }
  };
}

function postgresReportFromRow(row: Record<string, unknown>): ProblemReport {
  return normalizeReport({
    id: String(row.id),
    numericId: Number(row.numeric_id ?? deriveNumericId(String(row.id))),
    category: row.category as ProblemReportCategory,
    description: String(row.description ?? ""),
    screenshot: row.screenshot ? String(row.screenshot) : null,
    pageUrl: String(row.page_url ?? ""),
    userAgent: String(row.user_agent ?? ""),
    viewport: String(row.viewport ?? ""),
    userSub: row.user_sub ? String(row.user_sub) : null,
    userEmail: row.user_email ? String(row.user_email) : null,
    userName: row.user_name ? String(row.user_name) : null,
    createdAt: dateIso(row.created_at),
    resolved: Boolean(row.resolved),
    resolvedAt: row.resolved_at ? dateIso(row.resolved_at) : null,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    feedbackMessage: row.feedback_message ? String(row.feedback_message) : null,
    feedbackSentAt: row.feedback_sent_at ? dateIso(row.feedback_sent_at) : null,
    feedbackBy: row.feedback_by ? String(row.feedback_by) : null
  });
}

async function readDb(): Promise<ReportDb> {
  try {
    return JSON.parse(await readFile(REPORTS_PATH, "utf8")) as ReportDb;
  } catch {
    return { reports: [] };
  }
}

async function writeDb(db: ReportDb): Promise<void> {
  await mkdir(path.dirname(REPORTS_PATH), { recursive: true });
  await writeFile(REPORTS_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function buildReport(input: ProblemReportInput, numericId: number): ProblemReport {
  return normalizeReport({
    ...input,
    id: `report-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    numericId,
    createdAt: new Date().toISOString()
  });
}

function normalizeReport(report: StoredProblemReport): ProblemReport {
  return {
    ...report,
    numericId: Number(report.numericId ?? deriveNumericId(report.id)),
    userSub: report.userSub ?? null,
    resolved: Boolean(report.resolved),
    resolvedAt: report.resolvedAt ?? null,
    resolvedBy: report.resolvedBy ?? null,
    feedbackMessage: report.feedbackMessage ?? null,
    feedbackSentAt: report.feedbackSentAt ?? null,
    feedbackBy: report.feedbackBy ?? null
  };
}

function nextJsonNumericId(db: ReportDb): number {
  return db.reports.reduce((max, report) => Math.max(max, Number(report.numericId ?? deriveNumericId(report.id))), 0) + 1;
}

function deriveNumericId(id: string): number {
  const timestamp = /^report-(\d+)/.exec(id)?.[1];
  if (timestamp) return Number(timestamp.slice(-8));
  return Math.abs(
    id.split("").reduce((hash, char) => {
      return (hash * 31 + char.charCodeAt(0)) | 0;
    }, 0)
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
      connectionLimit: 5
    };
  }
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5
  };
}

function mysqlDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
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

function dateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
