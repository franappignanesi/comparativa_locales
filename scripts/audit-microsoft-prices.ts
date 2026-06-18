import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import { DEFAULT_REGION, REGIONS, type RegionId } from "../src/lib/regions";
import { getGameSample } from "../src/lib/sample-builder";
import type { LatestPrices, NormalizedPrice } from "../src/lib/types";

loadEnvConfig(process.cwd());

type AuditIssueKind =
  | "missing_timestamp"
  | "stale"
  | "manual"
  | "discount_without_timestamp"
  | "large_discount"
  | "expected_but_unavailable"
  | "missing_product_id";

type AuditIssue = {
  gameId: string;
  title: string;
  region: RegionId;
  kind: AuditIssueKind;
  finalPrice: number | null;
  basePrice: number | null;
  currency: string | null;
  discountPct: number | null;
  fetchedAt: string | null;
  url: string | null;
  source: string | null;
  error?: string;
};

type AuditReport = {
  timestamp: string;
  staleHours: number;
  regions: Array<{
    region: RegionId;
    totalRows: number;
    expectedMicrosoft: number;
    availableMicrosoft: number;
    missingTimestamp: number;
    stale: number;
    manual: number;
    discounted: number;
    expectedButUnavailable: number;
    missingProductId: number;
  }>;
  issues: AuditIssue[];
};

const DEFAULT_STALE_HOURS = 96;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const sample = await getGameSample();
  const regions = parseRegions(process.env.PRICE_REGIONS);
  const staleHours = parsePositiveNumber(process.env.PRICE_STALE_HOURS) ?? DEFAULT_STALE_HOURS;
  const issues: AuditIssue[] = [];
  const regionReports: AuditReport["regions"] = [];
  const gamesById = new Map(sample.broadSample.map((game) => [game.id, game]));

  for (const region of regions) {
    const latest = await readJson<LatestPrices | null>(latestPricesPath(region), null);
    if (!latest) continue;

    let expectedMicrosoft = 0;
    let availableMicrosoft = 0;
    let missingTimestamp = 0;
    let stale = 0;
    let manual = 0;
    let discounted = 0;
    let expectedButUnavailable = 0;
    let missingProductId = 0;

    for (const row of latest.prices) {
      const game = gamesById.get(row.gameId);
      const price = row.prices.microsoft;
      const expectsMicrosoft = Boolean(
        game?.expectedStores.includes("microsoft") ||
          game?.availableStores.includes("microsoft") ||
          price?.url ||
          price?.available
      );
      if (!expectsMicrosoft) continue;

      expectedMicrosoft += 1;
      if (!game?.identifiers.microsoftProductId && !extractProductId(game?.identifiers.microsoftUrl ?? price?.url ?? null)) {
        missingProductId += 1;
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "missing_product_id"));
      }

      if (!price?.available || price.arsFinalPrice == null) {
        expectedButUnavailable += 1;
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "expected_but_unavailable"));
        continue;
      }

      availableMicrosoft += 1;
      if ((price.discountPct ?? 0) > 0) discounted += 1;
      if (price.source === "manual") {
        manual += 1;
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "manual"));
      }
      if (!price.fetchedAt) {
        missingTimestamp += 1;
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "missing_timestamp"));
        if ((price.discountPct ?? 0) > 0) {
          issues.push(toIssue(region, row.gameId, row.gameTitle, price, "discount_without_timestamp"));
        }
      } else if (isStale(price.fetchedAt, staleHours)) {
        stale += 1;
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "stale"));
      }
      if (isSuspiciousDiscount(price)) {
        issues.push(toIssue(region, row.gameId, row.gameTitle, price, "large_discount"));
      }
    }

    regionReports.push({
      region,
      totalRows: latest.prices.length,
      expectedMicrosoft,
      availableMicrosoft,
      missingTimestamp,
      stale,
      manual,
      discounted,
      expectedButUnavailable,
      missingProductId
    });
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    staleHours,
    regions: regionReports,
    issues
  };
  await writeJson(dataPath("generated", "microsoft-price-audit.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

function toIssue(
  region: RegionId,
  gameId: string,
  title: string,
  price: NormalizedPrice | undefined,
  kind: AuditIssueKind
): AuditIssue {
  return {
    gameId,
    title,
    region,
    kind,
    finalPrice: price?.originalFinalPrice ?? price?.finalPrice ?? null,
    basePrice: price?.originalBasePrice ?? price?.basePrice ?? null,
    currency: price?.originalCurrency ?? price?.currency ?? null,
    discountPct: price?.discountPct ?? null,
    fetchedAt: price?.fetchedAt ?? null,
    url: price?.url ?? null,
    source: price?.source ?? null,
    error: price?.error
  };
}

function isSuspiciousDiscount(price: NormalizedPrice): boolean {
  if (!price.basePrice || !price.finalPrice || price.basePrice <= 0) return false;
  return (price.discountPct ?? 0) >= 70 || price.finalPrice / price.basePrice <= 0.35;
}

function isStale(fetchedAt: string, staleHours: number): boolean {
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return true;
  return (Date.now() - timestamp) / (1000 * 60 * 60) > staleHours;
}

function extractProductId(url: string | null): string | null {
  if (!url) return null;
  const matches = url.toUpperCase().match(/[A-Z0-9]{12,}/g);
  return matches?.find((match) => match.startsWith("9") || match.startsWith("C") || match.startsWith("B")) ?? null;
}

function parseRegions(value: string | undefined): RegionId[] {
  if (!value) return REGIONS.map((region) => region.id);
  const selected = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is RegionId => REGIONS.some((region) => region.id === item));
  return selected.length ? selected : [DEFAULT_REGION];
}

function parsePositiveNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function latestPricesPath(region: RegionId): string {
  return dataPath("generated", region === "AR" ? "latest-prices.json" : `latest-prices-${region}.json`);
}
