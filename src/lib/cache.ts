import { promises as fs } from "fs";
import path from "path";
import { hasOperationalStore, readJsonState, stateKeyFromPath, writeJsonState } from "./operational-store";

const root = process.cwd();

export function dataPath(...parts: string[]): string {
  return path.join(root, "data", ...parts);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (isStaticPublicCache(filePath)) {
    const local = await readLocalJson<T>(filePath, null);
    if (local) return local;
  }

  try {
    const operational = await readJsonState<T>(stateKeyFromPath(filePath));
    if (operational) return operational;
  } catch (error) {
    console.error("[cache] operational read failed; falling back to local JSON", {
      key: stateKeyFromPath(filePath),
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return (await readLocalJson<T>(filePath, fallback)) ?? fallback;
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  if (isStaticPublicCache(filePath)) {
    await writeLocalJson(filePath, data);
    if (!shouldMirrorPublicCacheToOperational()) return;
  }

  if (hasOperationalStore()) {
    await writeJsonState(stateKeyFromPath(filePath), data);
    if (process.env.NODE_ENV === "production") return;
  }
  await writeLocalJson(filePath, data);
}

async function readLocalJson<T>(filePath: string, fallback: T | null): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function writeLocalJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

function isStaticPublicCache(filePath: string): boolean {
  if (process.env.GLITCHPRICE_PUBLIC_CACHE_SOURCE === "operational") return false;
  const key = stateKeyFromPath(filePath);
  return (
    key === "generated/game-sample.json" ||
    /^generated\/latest-prices(?:-[A-Z]{2})?\.json$/.test(key) ||
    /^generated\/price-history(?:-[A-Z]{2})?\.json$/.test(key) ||
    /^generated\/itad(?:-full)?-history(?:-[A-Z]{2})?\.json$/.test(key)
  );
}

function shouldMirrorPublicCacheToOperational(): boolean {
  return process.env.GLITCHPRICE_MIRROR_PUBLIC_CACHE_TO_OPERATIONAL === "1" && process.env.GLITCHPRICE_ALLOW_PUBLIC_CACHE_OPERATIONAL_WRITES === "1";
}

export async function readLatestValid<T extends { timestamp: string | null }>(
  filePath: string,
  fallback: T
): Promise<T> {
  const data = await readJson<T>(filePath, fallback);
  return data.timestamp ? data : fallback;
}
