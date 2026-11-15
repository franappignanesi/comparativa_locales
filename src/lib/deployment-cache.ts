import { promises as fs } from "node:fs";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const publicCache = /^(?:game-sample|(?:latest-prices|itad-history)(?:-[A-Z]{2})?)\.json$/;

// Deployment copies only: workers retain their normal JSON caches and backups.
export async function compressDeploymentCaches(directory: string) {
  const files = (await fs.readdir(directory)).filter(file => publicCache.test(file)).sort();
  const results: Array<{ file: string; before: number; after: number }> = [];
  for (const file of files) {
    const source = path.join(directory, file);
    const bytes = await fs.readFile(source);
    JSON.parse(bytes.toString("utf8"));
    const compressed = await compress(bytes, { level: 9 });
    const destination = `${source}.gz`;
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, compressed);
      const verified = await decompress(await fs.readFile(temporary));
      if (!verified.equals(bytes)) throw new Error(`Lossless compression check failed: ${file}`);
      await fs.rename(temporary, destination);
      await fs.unlink(source);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    results.push({ file, before: bytes.length, after: compressed.length });
  }
  return results;
}
