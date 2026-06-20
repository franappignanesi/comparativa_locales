const CATEGORY_LABELS: Record<string, string> = {
  Action: "Acción",
  Adventure: "Aventura",
  RPG: "RPG",
  Strategy: "Estrategia",
  Simulation: "Simulación",
  Indie: "Indie",
  Sports: "Deportes",
  Racing: "Carreras",
  Casual: "Casual",
  Multiplayer: "Multijugador",
  "Massively Multiplayer": "Multijugador masivo",
  "Sin tag Steam": "Sin etiqueta de Steam",
  "Sin tag": "Sin etiqueta",
  "AAA nuevo": "AAA nuevo",
  "AAA viejo": "AAA clásico",
  "indie popular": "Indie popular",
  AA: "AA",
  clásico: "Clásico",
  "clÃ¡sico": "Clásico",
  "Microsoft/Xbox": "Microsoft/Xbox",
  "multiplayer pago": "Multijugador pago"
};

export function formatGameCategory(category: string | null | undefined): string {
  const key = category?.trim();
  if (!key) return "Sin categoría";
  return CATEGORY_LABELS[key] ?? key;
}
