import { loadEnvConfig } from "@next/env";
import { pruneOperationalStore } from "../src/lib/operational-store";

loadEnvConfig(process.cwd());

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const storage = await pruneOperationalStore();
  console.log(JSON.stringify({ ok: true, pruned: true, storage }, null, 2));
}
