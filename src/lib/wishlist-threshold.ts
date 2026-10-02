export function parseWishlistThreshold(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(text)) return null;
  const price = Number(text.replace(",", "."));
  return Number.isFinite(price) && price > 0 ? price : null;
}
