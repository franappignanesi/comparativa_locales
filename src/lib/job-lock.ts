import { promises as fs } from "fs";
import path from "path";
import { dataPath } from "./cache";
import { acquireOperationalLock } from "./operational-store";

export type JobLock = {
  name: string;
  owner: string;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
};

export type AcquiredJobLock = {
  acquired: true;
  lock: JobLock;
  release: () => Promise<void>;
};

export type BusyJobLock = {
  acquired: false;
  lock: JobLock | null;
};

export type JobLockResult = AcquiredJobLock | BusyJobLock;

const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;

export async function acquireJobLock(
  name: string,
  options: { ttlMs?: number; metadata?: Record<string, unknown> } = {}
): Promise<JobLockResult> {
  const now = new Date();
  const lock: JobLock = {
    name,
    owner: `${process.pid}-${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (options.ttlMs ?? DEFAULT_LOCK_TTL_MS)).toISOString(),
    metadata: options.metadata
  };
  const operationalLock = await acquireOperationalLock(lock);
  if (operationalLock) return operationalLock;

  const filePath = lockPath(name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await removeExpiredLock(filePath);

  try {
    const handle = await fs.open(filePath, "wx");
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await handle.close();
    return {
      acquired: true,
      lock,
      release: async () => releaseJobLock(filePath, lock.owner)
    };
  } catch {
    return { acquired: false, lock: await readLock(filePath) };
  }
}

async function removeExpiredLock(filePath: string): Promise<void> {
  const lock = await readLock(filePath);
  if (!lock) return;
  const expiresAt = Date.parse(lock.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return;
  await fs.rm(filePath, { force: true });
}

async function releaseJobLock(filePath: string, owner: string): Promise<void> {
  const lock = await readLock(filePath);
  if (!lock || lock.owner !== owner) return;
  await fs.rm(filePath, { force: true });
}

async function readLock(filePath: string): Promise<JobLock | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as JobLock;
  } catch {
    return null;
  }
}

function lockPath(name: string): string {
  const safeName = name.replace(/[^a-z0-9_.-]/gi, "-").toLowerCase();
  return dataPath("generated", "locks", `${safeName}.lock.json`);
}
