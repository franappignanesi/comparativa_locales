import sharp from "sharp";
import { mkdir, stat, writeFile } from "node:fs/promises";

let before = 0;
let after = 0;
for (const [folder, names, size] of [
  ["store-logos", ["steam.png", "epic.png", "gog.webp", "humble.png", "microsoft.png"], 64],
  ["flags", ["arg.png", "mex.png", "esp.png", "peru.png", "chile.png"], 48]
]) {
  for (const name of names) {
    const input = `public/${folder}/${name}`;
    const output = `public/${folder}/${name.replace(/\.[^.]+$/, "")}-small.webp`;
    before += (await stat(input)).size;
    const result = await sharp(input).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toFile(output);
    after += result.size;
  }
}
const css = await fetch("https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&display=swap", {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" }, signal: AbortSignal.timeout(15000)
}).then(r => { if (!r.ok) throw Error(`Font CSS HTTP ${r.status}`); return r.text(); });
const url = css.match(/\/\* latin \*\/[\s\S]*?url\((https:\/\/fonts.gstatic.com\/[^)]+\.woff2)\)/)?.[1];
if (!url) throw Error("Montserrat Latin variable font missing");
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error(`Font HTTP ${response.status}`);
await mkdir("src/app/fonts", { recursive: true });
await writeFile("src/app/fonts/montserrat-latin.woff2", Buffer.from(await response.arrayBuffer()));
const license = await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/OFL.txt", { signal: AbortSignal.timeout(15000) });
if (!license.ok) throw Error(`Font license HTTP ${license.status}`);
await writeFile("src/app/fonts/OFL.txt", await license.text());
console.log(JSON.stringify({ iconsBefore: before, iconsAfter: after }));
