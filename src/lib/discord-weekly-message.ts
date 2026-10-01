import { DISCORD_SITE } from "./discord-config";
import { discordText } from "./discord-messages";
import { discordPriceFresh } from "./discord-notifications";
import { STORE_NAMES } from "./seo";
import { STORES, type LatestPrices, type NormalizedPrice, type SampleGame } from "./types";
import { formatWeekendDate, type WeekendGame } from "./weekend-games";
import type { DiscordPayload } from "./discord-store";

type Row = LatestPrices["prices"][number];
type Quote = { store: typeof STORES[number]; price: NormalizedPrice; amount: number; usd: number | null };
const gameLink = (row: Row) => `[${discordText(row.gameTitle, 100)}](${DISCORD_SITE}/biblioteca?game=${encodeURIComponent(row.gameId)}&query=${encodeURIComponent(row.gameTitle.slice(0, 100))}&region=AR)`;
const money = (quote: Quote) => `${quote.price.originalCurrency ?? quote.price.currency} ${quote.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const discount = (quote: Quote) => {
  const pct = quote.price.discountPct;
  return pct != null && pct > 0 && pct <= 100 ? ` (con ${pct}% de descuento!)` : "";
};
function publicUrl(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function quotes(row: Row, latest: LatestPrices): Quote[] {
  return STORES.flatMap((store) => {
    const price = row.prices[store];
    const amount = price?.originalFinalPrice ?? price?.finalPrice;
    const currency = price?.originalCurrency ?? price?.currency;
    if (!price || !discordPriceFresh(price, latest.timestamp) || amount == null || !Number.isFinite(amount) || amount < 0 || !currency?.match(/^[A-Z]{3}$/) || !publicUrl(price.url)) return [];
    // Compare normalized USD, never native ARS against USD. Unknown conversions are excluded.
    const normalized = currency === "USD" ? amount : price.usdFinalPrice;
    const usd = normalized != null && Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
    return [{ store, price, amount, usd }];
  });
}
function cheaper(quotes: Quote[]) {
  const steam = quotes.find((quote) => quote.store === "steam");
  if (steam?.usd == null || steam.usd <= 0) return null;
  const other = quotes.filter((quote) => quote.store !== "steam" && quote.usd != null && quote.usd < steam.usd!)
    .sort((a, b) => a.usd! - b.usd!)[0];
  return other ? { steam, other, saving: 1 - other.usd! / steam.usd } : null;
}

export function buildDiscordWeeklyMessage(latest: LatestPrices, catalog: SampleGame[], weekend: WeekendGame[], popularity: Map<string, number>, recent: Set<string>): DiscordPayload {
  const used = new Set<string>();
  const embeds: NonNullable<DiscordPayload["embeds"]> = [];
  const recommendation = [...weekend].filter((game) => publicUrl(game.videoUrl))
    .sort((a, b) => (b.reviewDate ?? "").localeCompare(a.reviewDate ?? ""))[0];
  if (recommendation) {
    const match = catalog.find((game) => game.identifiers.steamAppId === recommendation.steamAppId);
    const row = latest.prices.find((game) => game.gameId === match?.id);
    if (row) used.add(row.gameId);
    const current = row ? quotes(row, latest) : [];
    const comparison = cheaper(current);
    const steam = current.find((quote) => quote.store === "steam");
    const prices = steam ? `Se consigue a **${money(steam)} en Steam**${discount(steam)}${comparison ? `, pero a **${money(comparison.other)} en ${STORE_NAMES[comparison.other.store]}**${discount(comparison.other)}` : ""}.` : "Consultá los precios disponibles en BARATEAM.";
    const image = publicUrl(row?.coverUrl ?? recommendation.coverUrl);
    embeds.push({ title: "🎮 Juego del finde", color: 0x65d6c4,
      description: `La recomendación de la casa fue **${row ? gameLink(row) : discordText(recommendation.title, 100)}**.\nRecomendado el ${discordText(formatWeekendDate(recommendation), 40)}.\n\n${prices}\n\n▶️ [Mirá el video donde lo recomendamos](${publicUrl(recommendation.videoUrl)})`,
      ...(image ? { thumbnail: { url: image } } : {}) });
  }
  const eligible = latest.prices.filter((row) => row.gameId.length <= 191 && !["edition_mismatch", "uncertain_match", "manual_review_needed"].includes(row.comparisonStatus))
    .map((row) => ({ row, quotes: quotes(row, latest) }));
  const offers = eligible.filter(({ row }) => !used.has(row.gameId)).flatMap(({ row, quotes }) => {
    const quote = quotes.filter((quote) => (quote.price.discountPct ?? 0) >= 20 && (quote.price.discountPct ?? 0) <= 100)
      .sort((a, b) => b.price.discountPct! - a.price.discountPct!)[0];
    return quote ? [{ row, quote, score: quote.price.discountPct! + Math.min(15, Math.log2(1 + Math.max(0, popularity.get(row.gameId) ?? 0)) * 3) }] : [];
  }).sort((a, b) => b.score - a.score || a.row.gameId.localeCompare(b.row.gameId));
  const offerLines: string[] = [];
  for (const { row, quote } of offers) {
    if (used.has(row.gameId)) continue;
    const line = `**${offerLines.length + 1}.** ${gameLink(row)} · **${quote.price.discountPct}% OFF** · **${money(quote)}** (${STORE_NAMES[quote.store]})`;
    if ([...offerLines, line].join("\n\n").length > 2500) continue;
    used.add(row.gameId);
    offerLines.push(line);
    if (offerLines.length === 5) break;
  }
  if (!offerLines.length && !recommendation) throw new Error("No eligible current offers");
  embeds.push({ title: "🔥 Ofertas para viciar", color: 0xffcf00, description: offerLines.join("\n\n") || "Esta semana no encontramos descuentos vigentes para destacar." });
  const alternatives = eligible.filter(({ row }) => !used.has(row.gameId) && !recent.has(row.gameId))
    .flatMap(({ row, quotes }) => { const comparison = cheaper(quotes); return comparison && comparison.saving >= 0.2 ? [{ row, ...comparison }] : []; })
    .sort((a, b) => b.saving - a.saving || (popularity.get(b.row.gameId) ?? 0) - (popularity.get(a.row.gameId) ?? 0));
  const bargainGameIds: string[] = [];
  const bargainLines: string[] = [];
  for (const { row, steam, other } of alternatives) {
    if (used.has(row.gameId)) continue;
    const line = `**${bargainLines.length + 1}.** ${gameLink(row)}: **${money(other)} en ${STORE_NAMES[other.store]}**, mientras que sale ${money(steam)} en Steam.`;
    if ([...bargainLines, line].join("\n\n").length > 1600) continue;
    used.add(row.gameId);
    bargainGameIds.push(row.gameId);
    bargainLines.push(line);
    if (bargainLines.length === 3) break;
  }
  embeds.push({ title: "👀 Más baratos que en Steam", color: 0xf59477,
    description: bargainLines.join("\n\n") || "No hay nuevas diferencias destacadas esta semana: preferimos no repetir las anteriores." });
  embeds.push({
    description: `Compará juegos entre tiendas oficiales en **5 países**, guardá tu lista de deseados y consultá precios históricos en [**BARATEAM**](${DISCORD_SITE}).\n\n¡Hasta la semana que viene!`,
    footer: { text: "Argentina · Precios sin impuestos. Selección por descuento y popularidad. Las ofertas pueden terminar: confirmá en la tienda." }, timestamp: latest.timestamp ?? undefined });
  return { content: "**Buenas gente!** Acá algunos de los juegos más interesantes de la semana en **BARATEAM** 👇", embeds, bargainGameIds };
}
