import { promises as fs } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { stateKeyFromPath, writeJsonState } from "../src/lib/operational-store";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const dataRoot = path.join(process.cwd(), "data");
  const files = await listJsonFiles(dataRoot);
  let migrated = 0;

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    await writeJsonState(stateKeyFromPath(filePath), parsed);
    migrated += 1;
  }

  console.log(JSON.stringify({ ok: true, migrated }, null, 2));
}

async function listJsonFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listJsonFiles(filePath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(filePath);
    }
  }
  return result;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
