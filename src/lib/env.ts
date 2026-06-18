export type EnvCheck = {
  name: string;
  present: boolean;
  required: boolean;
  scope: "public" | "server";
  note: string;
};

const checks: Array<Omit<EnvCheck, "present">> = [
  {
    name: "ITAD_API_KEY",
    required: true,
    scope: "server",
    note: "Necesaria para mínimos e historial de Steam, Epic, GOG y Humble."
  },
  {
    name: "CRON_SECRET",
    required: true,
    scope: "server",
    note: "Protege los endpoints de actualización automática."
  },
  {
    name: "SESSION_SECRET",
    required: true,
    scope: "server",
    note: "Firma la cookie HttpOnly de sesion."
  },
  {
    name: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    required: true,
    scope: "public",
    note: "Habilita login con Google en el cliente."
  },
  {
    name: "DATABASE_URL",
    required: false,
    scope: "server",
    note: "Activa persistencia Postgres/Neon o MySQL para usuarios, wishlist y ajustes."
  },
  {
    name: "MYSQL_HOST",
    required: false,
    scope: "server",
    note: "Alternativa a DATABASE_URL para Hostinger/MySQL."
  },
  {
    name: "USD_TO_ARS",
    required: false,
    scope: "server",
    note: "Fallback para dólar tarjeta si DolarAPI falla."
  },
  {
    name: "OFFICIAL_USD_TO_ARS",
    required: false,
    scope: "server",
    note: "Fallback para reconstruir precios oficiales USD en Argentina."
  },
  {
    name: "PRICE_REGIONS",
    required: false,
    scope: "server",
    note: "Regiones a actualizar por cron; por defecto usa todas."
  }
];

export function getEnvStatus(): { ok: boolean; checks: EnvCheck[]; missingRequired: string[] } {
  const resolved = checks.map((check) => ({
    ...check,
    present: Boolean(process.env[check.name])
  }));
  const missingRequired = resolved.filter((check) => check.required && !check.present).map((check) => check.name);
  return {
    ok: missingRequired.length === 0,
    checks: resolved,
    missingRequired
  };
}

export function assertCronSecret(requestSecret: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && requestSecret && requestSecret === expected);
}
