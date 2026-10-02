import { restoreCache } from "@actions/cache";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const keys = (process.env.RECOVERY_CACHES ?? "").split(",").map(key => key.trim()).filter(Boolean);
if (!keys.length || keys.length > 20 || keys.some(key => !/^barateam-public-data-\d+$/.test(key))) {
  throw new Error("Provide 1-20 exact legacy public dataset cache keys");
}
const paths = [
  "data/generated/game-sample.json", "data/generated/latest-prices*.json",
  "data/generated/price-history*.json", "data/generated/price-history*.json.gz",
  "data/generated/itad-history*.json", "data/generated/itad-full-history*.json",
  "data/generated/pending-releases.json", "data/generated/steam-sale-refresh-cursor-*.json"
];
const generated = path.resolve("data/generated");
const backup = path.resolve("artifacts/history-recovery-current");
const runRecovery = args => execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/recover-price-history.ts", ...args], { stdio: "inherit" });
for (const key of keys) {
  runRecovery(["--capture"]);
  try {
    // The backup is complete; remove only history variants that could shadow this archive.
    for (const name of await fs.readdir(generated)) {
      if (!/^price-history(?:-[A-Z]{2})?\.json(?:\.gz)?$/.test(name)) continue;
      const target = path.resolve(generated, name);
      if (path.dirname(target) !== generated) throw new Error("Unsafe recovery target");
      await fs.unlink(target);
    }
    const matched = await restoreCache(paths, key);
    if (matched !== key) throw new Error(`Exact historical cache unavailable: ${key}`);
    console.log(JSON.stringify({ recovering: key }));
    runRecovery([]);
  } catch (error) {
    for (const name of await fs.readdir(backup)) await fs.copyFile(path.join(backup, name), path.join(generated, name));
    throw error;
  }
}
