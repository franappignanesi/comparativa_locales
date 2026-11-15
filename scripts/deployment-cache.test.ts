import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { compressDeploymentCaches } from "../src/lib/deployment-cache";
import { readJson } from "../src/lib/cache";

test("deployment caches shrink without losing prices, dates or metadata in any region", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "barateam-deploy-"));
  try {
    const payload = { timestamp: "2026-11-14T18:00:00Z", metadata: { errors: [], exchangeRate: 1500 },
      prices: Array.from({ length: 50 }, (_, index) => ({ gameId: `game-${index}`, originalFinalPrice: 14.77, store: "steam" })) };
    const names = ["game-sample.json", ...["", "-AR", "-MX", "-ES", "-CL", "-PE"].flatMap(region => [`latest-prices${region}.json`, `itad-history${region}.json`])];
    const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    for (const name of names) await fs.writeFile(path.join(directory, name), bytes);
    const results = await compressDeploymentCaches(directory);
    assert.equal(results.length, names.length);
    for (const name of names) {
      const file = path.join(directory, name);
      const compressed = await fs.readFile(`${file}.gz`);
      assert.ok(compressed.length < bytes.length);
      assert.deepEqual(gunzipSync(compressed), bytes);
      // The runtime cache reader already supports compressed-only public data.
      assert.deepEqual(await readJson(file, null), payload);
      await assert.rejects(fs.access(file), { code: "ENOENT" });
    }
    assert.deepEqual(await compressDeploymentCaches(directory), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("compression leaves worker state, private files and history archives untouched", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "barateam-deploy-"));
  try {
    const untouched = ["users.json", "problem-reports.json", "catalog-expansion.json", "price-history.json", "itad-full-history.json", "latest-prices-audit.json"];
    for (const name of untouched) await fs.writeFile(path.join(directory, name), "unchanged");
    assert.deepEqual(await compressDeploymentCaches(directory), []);
    for (const name of untouched) assert.equal(await fs.readFile(path.join(directory, name), "utf8"), "unchanged");
    await fs.writeFile(path.join(directory, "latest-prices.json"), "invalid-json");
    await assert.rejects(compressDeploymentCaches(directory), SyntaxError);
    assert.equal(await fs.readFile(path.join(directory, "latest-prices.json"), "utf8"), "invalid-json");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
