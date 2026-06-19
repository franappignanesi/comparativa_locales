import { promises as fs } from "fs";
import path from "path";
import { hasOperationalStore, readJsonState, stateKeyFromPath, writeJsonState } from "./operational-store";

const root = process.cwd();

export function dataPath(...parts: string[]): string {
  return path.join(root, "data", ...parts);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const operational = await readJsonState<T>(stateKeyFromPath(filePath));
    if (operational) return operational;
  } catch (error) {
    console.error("[cache] operational read failed; falling back to local JSON", {
      key: stateKeyFromPath(filePath),
      error: error instanceof Error ? error.message : String(error)
    });
  }
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  if (hasOperationalStore()) {
    await writeJsonState(stateKeyFromPath(filePath), data);
    if (process.env.NODE_ENV === "production") return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

export async function readLatestValid<T extends { timestamp: string | null }>(
  filePath: string,
  fallback: T
): Promise<T> {
  const data = await readJson<T>(filePath, fallback);
  return data.timestamp ? data : fallback;
}
