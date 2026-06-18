import type { NormalizedPrice, StorePrice } from "./types";
import { DEFAULT_REGION, REGIONS, type RegionId } from "./regions";

export const FALLBACK_USD_TO_ARS = Number(process.env.USD_TO_ARS ?? 1852.5);
export const FALLBACK_OFFICIAL_USD_TO_ARS = Number(process.env.OFFICIAL_USD_TO_ARS ?? 1410);
export const DIGITAL_VAT_RATE = Number(process.env.DIGITAL_VAT_RATE ?? 0.21);

const ARS_CODES = new Set(["ARS", "AR$", "$"]);
const USD_CODES = new Set(["USD", "US$"]);
const SUPPORTED_EXCHANGE_CURRENCIES = ["ARS", "MXN", "EUR", "PEN", "CLP"] as const;

export type ExchangeRate = {
  usdToArs: number;
  usdToTarget: number;
  currency: string;
  locale: string;
  region: RegionId;
  source: string;
  timestamp: string | null;
  usdRates?: Partial<Record<string, number>>;
  officialUsdToArs?: number;
  officialUsdToArsSource?: string;
  officialUsdToArsTimestamp?: string | null;
};

type EffectiveOriginalPrice = {
  currency: string | null;
  finalPrice: number | null;
  basePrice: number | null;
};

function normalizeCurrency(currency: string | null): string | null {
  if (!currency) return null;
  return currency.trim().toUpperCase();
}

function toTarget(value: number | null, currency: string | null, rate: ExchangeRate): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const code = normalizeCurrency(currency);
  if (!code || code === rate.currency) return roundCurrency(value, rate.currency);
  if (ARS_CODES.has(code) && rate.currency === "ARS") return roundCurrency(value, rate.currency);
  if (USD_CODES.has(code)) return roundCurrency(value * rate.usdToTarget, rate.currency);
  const sourceRate = getUsdRateForCurrency(code, rate);
  if (sourceRate && sourceRate > 0) return roundCurrency((value / sourceRate) * rate.usdToTarget, rate.currency);
  return null;
}

function toUsd(value: number | null, currency: string | null, rate: ExchangeRate): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const code = normalizeCurrency(currency);
  if (!code || USD_CODES.has(code)) return roundUsd(value);
  const sourceRate = getUsdRateForCurrency(code, rate);
  if (!sourceRate || sourceRate <= 0) return null;
  return roundUsd(value / sourceRate);
}

export function getDigitalTaxRate(regionId: RegionId): number {
  if (regionId === "AR" && process.env.DIGITAL_VAT_RATE) return DIGITAL_VAT_RATE;
  return REGIONS.find((region) => region.id === regionId)?.digitalTaxRate ?? 0;
}

function withDigitalVat(value: number | null, currency: string | null, rate: ExchangeRate | { currency: string; region: RegionId }): number | null {
  if (value == null) return null;
  const taxRate = shouldApplyDigitalTax(currency, rate) ? getDigitalTaxRate(rate.region) : 0;
  const taxedValue = taxRate > 0 ? value * (1 + taxRate) : value;
  return roundCurrency(taxedValue, rate.currency);
}

function shouldApplyDigitalTax(currency: string | null, rate: ExchangeRate | { currency: string; region: RegionId }): boolean {
  const code = normalizeCurrency(currency);
  if (rate.region === "AR") return true;
  if (!code) return false;
  return code !== normalizeCurrency(rate.currency);
}

function roundCurrency(value: number, currency: string): number {
  const zeroDecimalCurrencies = new Set(["ARS", "CLP"]);
  return zeroDecimalCurrencies.has(currency.toUpperCase()) ? Math.round(value) : Math.round(value * 100) / 100;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function getUsdRateForCurrency(currency: string, rate: ExchangeRate): number | null {
  const code = normalizeCurrency(currency);
  if (!code) return null;
  if (USD_CODES.has(code)) return 1;
  if (ARS_CODES.has(code)) return rate.usdToArs;
  if (code === rate.currency) return rate.usdToTarget;
  const value = rate.usdRates?.[code];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function getUsdToArsRate(): Promise<ExchangeRate> {
  try {
    const [tarjetaResponse, oficialResponse] = await Promise.all([
      fetch("https://dolarapi.com/v1/dolares/tarjeta", {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 30 }
      }),
      fetch("https://dolarapi.com/v1/dolares/oficial", {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 30 }
      })
    ]);
    if (!tarjetaResponse.ok) throw new Error(`DolarAPI tarjeta HTTP ${tarjetaResponse.status}`);
    const data = (await tarjetaResponse.json()) as { venta?: number; fechaActualizacion?: string };
    const officialData = oficialResponse.ok ? ((await oficialResponse.json()) as { venta?: number; fechaActualizacion?: string }) : null;
    if (typeof data.venta !== "number" || !Number.isFinite(data.venta)) throw new Error("DolarAPI tarjeta sin venta");
    return {
      usdToArs: data.venta,
      usdToTarget: data.venta,
      currency: "ARS",
      locale: "es-AR",
      region: "AR",
      source: "DolarAPI dólar tarjeta venta",
      timestamp: data.fechaActualizacion ?? null,
      usdRates: { ARS: data.venta },
      officialUsdToArs:
        typeof officialData?.venta === "number" && Number.isFinite(officialData.venta) ? officialData.venta : FALLBACK_OFFICIAL_USD_TO_ARS,
      officialUsdToArsSource: officialData ? "DolarAPI dólar oficial venta" : "fallback OFFICIAL_USD_TO_ARS",
      officialUsdToArsTimestamp: officialData?.fechaActualizacion ?? null
    };
  } catch {
    return {
      usdToArs: FALLBACK_USD_TO_ARS,
      usdToTarget: FALLBACK_USD_TO_ARS,
      currency: "ARS",
      locale: "es-AR",
      region: "AR",
      source: "fallback USD_TO_ARS",
      timestamp: null,
      usdRates: { ARS: FALLBACK_USD_TO_ARS },
      officialUsdToArs: FALLBACK_OFFICIAL_USD_TO_ARS,
      officialUsdToArsSource: "fallback OFFICIAL_USD_TO_ARS",
      officialUsdToArsTimestamp: null
    };
  }
}

export async function getExchangeRate(regionId: RegionId = DEFAULT_REGION): Promise<ExchangeRate> {
  if (regionId === "AR") return getUsdToArsRate();
  const region = REGIONS.find((item) => item.id === regionId) ?? REGIONS[0];
  const fallbackRates = getFallbackUsdRates();
  const liveRates = await getLiveUsdRates();
  const usdRates = { ...fallbackRates, ...liveRates.rates };
  const usdToTarget = usdRates[region.currency] ?? fallbackRates[region.currency] ?? 1;
  return {
    usdToArs: FALLBACK_USD_TO_ARS,
    usdToTarget,
    currency: region.currency,
    locale: region.locale,
    region: region.id,
    source: liveRates.rates[region.currency] ? liveRates.source : `fallback USD_TO_${region.currency}`,
    timestamp: liveRates.rates[region.currency] ? liveRates.timestamp : null,
    usdRates
  };
}

export function normalizePrice(price: StorePrice, exchangeRate: ExchangeRate | number = FALLBACK_USD_TO_ARS): NormalizedPrice {
  const rate =
    typeof exchangeRate === "number"
      ? { usdToTarget: exchangeRate, currency: "ARS", locale: "es-AR", region: "AR" as RegionId }
      : exchangeRate;
  const original = effectiveOriginalPrice(price, rate as ExchangeRate);
  const arsConvertedFinalPrice = toTarget(original.finalPrice, original.currency, rate as ExchangeRate);
  const arsConvertedBasePrice = toTarget(original.basePrice, original.currency, rate as ExchangeRate);
  const usdFinalPrice = toUsd(original.finalPrice, original.currency, rate as ExchangeRate);
  const usdBasePrice = toUsd(original.basePrice, original.currency, rate as ExchangeRate);

  return {
    ...price,
    originalCurrency: original.currency,
    originalFinalPrice: original.finalPrice,
    originalBasePrice: original.basePrice,
    usdFinalPrice,
    usdBasePrice,
    arsConvertedFinalPrice,
    arsConvertedBasePrice,
    arsFinalPrice: withDigitalVat(arsConvertedFinalPrice, original.currency, rate),
    arsBasePrice: withDigitalVat(arsConvertedBasePrice, original.currency, rate)
  };
}

function effectiveOriginalPrice(price: StorePrice, rate: ExchangeRate): EffectiveOriginalPrice {
  const currency = normalizeCurrency(price.currency);
  if (rate.region !== "AR" || price.store === "microsoft" || price.source !== "itad" || currency !== "ARS") {
    return {
      currency: price.currency,
      finalPrice: price.finalPrice,
      basePrice: price.basePrice
    };
  }

  const officialUsdToArs = rate.officialUsdToArs && rate.officialUsdToArs > 0 ? rate.officialUsdToArs : FALLBACK_OFFICIAL_USD_TO_ARS;
  return {
    currency: "USD",
    finalPrice: price.finalPrice == null ? null : Math.round((price.finalPrice / officialUsdToArs) * 100) / 100,
    basePrice: price.basePrice == null ? null : Math.round((price.basePrice / officialUsdToArs) * 100) / 100
  };
}

type LiveUsdRates = {
  rates: Partial<Record<string, number>>;
  source: string;
  timestamp: string | null;
};

let liveUsdRatesPromise: Promise<LiveUsdRates> | null = null;

function getFallbackUsdRates(): Record<string, number> {
  return {
    ARS: FALLBACK_USD_TO_ARS,
    MXN: Number(process.env.USD_TO_MXN ?? 18.5),
    EUR: Number(process.env.USD_TO_EUR ?? 0.92),
    PEN: Number(process.env.USD_TO_PEN ?? 3.75),
    CLP: Number(process.env.USD_TO_CLP ?? 930)
  };
}

async function getLiveUsdRates(): Promise<LiveUsdRates> {
  liveUsdRatesPromise ??= fetchLiveUsdRates();
  return liveUsdRatesPromise;
}

async function fetchLiveUsdRates(): Promise<LiveUsdRates> {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 12 }
    });
    if (!response.ok) throw new Error(`ExchangeRate API HTTP ${response.status}`);
    const data = (await response.json()) as {
      result?: string;
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    if (data.result !== "success" || !data.rates) throw new Error("ExchangeRate API sin tasas");
    const rates: Partial<Record<string, number>> = {};
    for (const currency of SUPPORTED_EXCHANGE_CURRENCIES) {
      const value = data.rates[currency];
      if (typeof value === "number" && Number.isFinite(value)) rates[currency] = value;
    }
    return {
      rates,
      source: "ExchangeRate-API USD latest",
      timestamp: data.time_last_update_utc ?? null
    };
  } catch {
    return { rates: {}, source: "fallback USD rates", timestamp: null };
  }
}

export function formatArs(value: number | null | undefined, currency = "ARS", locale = "es-AR"): string {
  if (value == null) return "Sin dato";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" || currency === "CLP" ? 0 : 2
  }).format(value);
}
