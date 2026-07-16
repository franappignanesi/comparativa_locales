import { promises as fs } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { dataPath, readJson, writeJson } from "../src/lib/cache";
import type { PriceHistoryEntry } from "../src/lib/types";

loadEnvConfig(process.cwd());

type PriceHistoryFile = {
  timestamp: string | null;
  entries: PriceHistoryEntry[];
};

const emptyHistory: PriceHistoryFile = { timestamp: null, entries: [] };

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const generatedDir = dataPath("generated");
  const files = (await fs.readdir(generatedDir).catch(() => []))
    .filter((file) => /^price-history(?:-[A-Z]{2})?\.json$/.test(file))
    .sort();
  const results = [];

  for (const file of files) {
    const filePath = path.join(generatedDir, file);
    const before = await fileSize(filePath);
    const history = await readJson<PriceHistoryFile>(filePath, emptyHistory);
    const compacted = {
      ...history,
      entries: history.entries.map(compactEntry)
    };
    await writeJson(filePath, compacted);
    const after = await fileSize(filePath);
    results.push({ file, entries: compacted.entries.length, before, after, saved: before - after });
  }

  console.log(JSON.stringify({ ok: true, files: results.length, results }, null, 2));
}

function compactEntry(entry: PriceHistoryEntry): PriceHistoryEntry {
  if (entry.source !== "snapshot") return entry;
  return {
    gameId: entry.gameId,
    store: entry.store,
    timestamp: entry.timestamp,
    originalCurrency: entry.originalCurrency ?? null,
    originalFinalPrice: entry.originalFinalPrice ?? null,
    originalBasePrice: entry.originalBasePrice ?? null,
    arsFinalPrice: entry.arsFinalPrice ?? null,
    arsBasePrice: entry.arsBasePrice ?? null,
    discountPct: entry.discountPct ?? null,
    source: "snapshot"
  };
}

async function fileSize(filePath: string): Promise<number> {
  return (await fs.stat(filePath)).size;
}
