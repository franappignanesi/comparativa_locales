export type RegionId = "AR" | "MX" | "ES" | "PE" | "CL";

export type RegionConfig = {
  id: RegionId;
  label: string;
  flagSrc: string;
  currency: string;
  steamCc: string;
  epicCountry: string;
  microsoftMarket: string;
  locale: string;
  digitalTaxRate: number;
  digitalTaxLabel: string;
};

export const REGIONS: RegionConfig[] = [
  {
    id: "AR",
    label: "Argentina",
    flagSrc: "/flags/arg-small.webp",
    currency: "ARS",
    steamCc: "AR",
    epicCountry: "AR",
    microsoftMarket: "AR",
    locale: "es-AR",
    digitalTaxRate: 0.21,
    digitalTaxLabel: "IVA servicios digitales"
  },
  {
    id: "MX",
    label: "México",
    flagSrc: "/flags/mex-small.webp",
    currency: "MXN",
    steamCc: "MX",
    epicCountry: "MX",
    microsoftMarket: "MX",
    locale: "es-MX",
    digitalTaxRate: 0.16,
    digitalTaxLabel: "IVA servicios digitales"
  },
  {
    id: "ES",
    label: "España",
    flagSrc: "/flags/esp-small.webp",
    currency: "EUR",
    steamCc: "ES",
    epicCountry: "ES",
    microsoftMarket: "ES",
    locale: "es-ES",
    digitalTaxRate: 0.21,
    digitalTaxLabel: "IVA general"
  },
  {
    id: "PE",
    label: "Perú",
    flagSrc: "/flags/peru-small.webp",
    currency: "PEN",
    steamCc: "PE",
    epicCountry: "PE",
    microsoftMarket: "PE",
    locale: "es-PE",
    digitalTaxRate: 0.18,
    digitalTaxLabel: "IGV servicios digitales"
  },
  {
    id: "CL",
    label: "Chile",
    flagSrc: "/flags/chile-small.webp",
    currency: "CLP",
    steamCc: "CL",
    epicCountry: "CL",
    microsoftMarket: "CL",
    locale: "es-CL",
    digitalTaxRate: 0.19,
    digitalTaxLabel: "IVA servicios digitales"
  }
];

export const DEFAULT_REGION: RegionId = "AR";
