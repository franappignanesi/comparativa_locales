import { neon } from "@neondatabase/serverless";

type EngagementSql = ReturnType<typeof neon>;

export type EngagementTotals = {
  samples: number;
  totalSeconds: number;
  averageSeconds: number;
  under15: number;
  from15To60: number;
  from60To180: number;
  from180To600: number;
  over600: number;
};

export type EngagementRouteSummary = EngagementTotals & {
  path: string;
};

export type EngagementSummary = {
  periodDays: number;
  overall: EngagementTotals;
  routes: EngagementRouteSummary[];
};

let sqlClient: EngagementSql | null = null;
let initialized = false;

export async function recordPageEngagement(path: string, seconds: number): Promise<void> {
  if (!postgresConnectionString(false)) return;
  await ensureSchema();
  const buckets = bucketValues(seconds);
  await getSql().query(
    `INSERT INTO page_engagement_daily
       (day, path, samples, total_seconds, under_15, from_15_to_60, from_60_to_180, from_180_to_600, over_600, updated_at)
     VALUES (CURRENT_DATE, $1, 1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (day, path) DO UPDATE SET
       samples = page_engagement_daily.samples + 1,
       total_seconds = page_engagement_daily.total_seconds + EXCLUDED.total_seconds,
       under_15 = page_engagement_daily.under_15 + EXCLUDED.under_15,
       from_15_to_60 = page_engagement_daily.from_15_to_60 + EXCLUDED.from_15_to_60,
       from_60_to_180 = page_engagement_daily.from_60_to_180 + EXCLUDED.from_60_to_180,
       from_180_to_600 = page_engagement_daily.from_180_to_600 + EXCLUDED.from_180_to_600,
       over_600 = page_engagement_daily.over_600 + EXCLUDED.over_600,
       updated_at = NOW()`,
    [path, seconds, buckets.under15, buckets.from15To60, buckets.from60To180, buckets.from180To600, buckets.over600]
  );
}

export async function getEngagementSummary(periodDays = 30): Promise<EngagementSummary> {
  if (!postgresConnectionString(false)) return { periodDays, overall: emptyTotals(), routes: [] };
  await ensureSchema();
  const days = Math.min(90, Math.max(1, Math.round(periodDays)));
  const params = [days];
  const aggregate = `
    COALESCE(SUM(samples), 0) AS samples,
    COALESCE(SUM(total_seconds), 0) AS total_seconds,
    COALESCE(SUM(under_15), 0) AS under_15,
    COALESCE(SUM(from_15_to_60), 0) AS from_15_to_60,
    COALESCE(SUM(from_60_to_180), 0) AS from_60_to_180,
    COALESCE(SUM(from_180_to_600), 0) AS from_180_to_600,
    COALESCE(SUM(over_600), 0) AS over_600`;
  const overallRows = (await getSql().query(
    `SELECT ${aggregate} FROM page_engagement_daily WHERE day >= CURRENT_DATE - ($1::int - 1)`,
    params
  )) as Array<Record<string, unknown>>;
  const routeRows = (await getSql().query(
    `SELECT path, ${aggregate}
     FROM page_engagement_daily
     WHERE day >= CURRENT_DATE - ($1::int - 1)
     GROUP BY path
     ORDER BY SUM(total_seconds) DESC
    LIMIT 20`,
    params
  )) as Array<Record<string, unknown>>;
  return {
    periodDays: days,
    overall: totalsFromRow(overallRows[0] as Record<string, unknown> | undefined),
    routes: routeRows.map((row) => ({ path: String(row.path), ...totalsFromRow(row as Record<string, unknown>) }))
  };
}

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await getSql().query(`
    CREATE TABLE IF NOT EXISTS page_engagement_daily (
      day DATE NOT NULL,
      path VARCHAR(255) NOT NULL,
      samples BIGINT NOT NULL DEFAULT 0,
      total_seconds BIGINT NOT NULL DEFAULT 0,
      under_15 BIGINT NOT NULL DEFAULT 0,
      from_15_to_60 BIGINT NOT NULL DEFAULT 0,
      from_60_to_180 BIGINT NOT NULL DEFAULT 0,
      from_180_to_600 BIGINT NOT NULL DEFAULT 0,
      over_600 BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (day, path)
    )
  `);
  initialized = true;
}

function getSql(): EngagementSql {
  sqlClient ??= neon(postgresConnectionString());
  return sqlClient;
}

function postgresConnectionString(required = true): string {
  const value = process.env.POSTGRES_URL || (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : "");
  if (!value && required) throw new Error("Missing Postgres config. Set POSTGRES_URL or a postgres DATABASE_URL.");
  return value;
}

function bucketValues(seconds: number): Omit<EngagementTotals, "samples" | "totalSeconds" | "averageSeconds"> {
  return {
    under15: seconds < 15 ? 1 : 0,
    from15To60: seconds >= 15 && seconds < 60 ? 1 : 0,
    from60To180: seconds >= 60 && seconds < 180 ? 1 : 0,
    from180To600: seconds >= 180 && seconds < 600 ? 1 : 0,
    over600: seconds >= 600 ? 1 : 0
  };
}

function totalsFromRow(row: Record<string, unknown> | undefined): EngagementTotals {
  const samples = Number(row?.samples ?? 0);
  const totalSeconds = Number(row?.total_seconds ?? 0);
  return {
    samples,
    totalSeconds,
    averageSeconds: samples ? Math.round(totalSeconds / samples) : 0,
    under15: Number(row?.under_15 ?? 0),
    from15To60: Number(row?.from_15_to_60 ?? 0),
    from60To180: Number(row?.from_60_to_180 ?? 0),
    from180To600: Number(row?.from_180_to_600 ?? 0),
    over600: Number(row?.over_600 ?? 0)
  };
}

function emptyTotals(): EngagementTotals {
  return { samples: 0, totalSeconds: 0, averageSeconds: 0, under15: 0, from15To60: 0, from60To180: 0, from180To600: 0, over600: 0 };
}
