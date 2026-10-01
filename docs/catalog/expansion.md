# Expansión curada del catálogo

Objetivo: hasta 5.000 fichas, sin inflar el catálogo con DLC, demos o ediciones no equivalentes.

## Selección

- Juegos: al menos 500 reseñas en SteamSpy, ordenados por volumen y valoración. SteamSpy sirve para relevancia, no para precios regionales.
- Packs: colecciones conocidas y packages oficiales asociados a franquicias populares. No se admiten bundles personalizados de Steam ni multipacks de copias del mismo juego.
- Validación: ficha Steam, Windows, producto pago disponible, identidad Steam app/sub exacta en ITAD, título canónico equivalente y precio actual Steam. No se usa búsqueda aproximada para asignar precios a packs.
- Cada tanda de packs debe tener al menos 70% con precio en otra tienda soportada, bajo la misma identidad de producto en ITAD. Ante discrepancias de contenido, queda para revisión manual.
- Hasta 150 packs nuevos, hasta 200 incorporaciones por corrida y 5.000 fichas totales. No se completa el cupo con coincidencias inseguras.

## Ejecución

1. `npm run catalog:curate -- --discover-only` genera la lista sin publicar ni necesitar secretos.
2. En GitHub, ejecutar **Daily full price refresh**, activar **catalog_expansion**, dejar todas las regiones y publicación habilitadas. La ejecución manual continúa sola hasta 5.000, sin más incorporaciones verificadas o 12 tandas (máximo 144 minutos de expansión).
3. El paso de expansión usa `ITAD_API_KEY` existente. El refresh y despliegue posteriores usan el catálogo ampliado sin cambiar su infraestructura.
4. Revisar **curated-incorporations** y el resumen del paso: incorporados, descartes, packs y cobertura. Las corridas diarias programadas continúan las tandas hasta 5.000. La variable de repositorio `CATALOG_EXPANSION_PAUSED=1` pausa esta expansión sin desactivar el descubrimiento habitual de lanzamientos ni el refresh de precios.

El progreso reside en `catalog-expansion.json` dentro del cache público de Actions, sin escritura de precios/catálogo en Neon. El estado va en el artifact `catalog-state`, separado del informe para preservar sus rutas. La lista inicial versionada permite arrancar si no existe estado previo.

Cada request tiene timeout de 15 segundos. Cada tanda tiene presupuesto de 12 minutos / 500 requests. Ante 429, 401 o 403 se detiene la tanda, sin insistir contra el proveedor. Los errores transitorios permanecen reintentables; los descartes definitivos quedan documentados. Un fallo de expansión no bloquea el refresh diario. No se envían notificaciones ni se despliega desde el script local.

La lista de propuestas no garantiza que todas vayan a incorporarse. Especialmente los 100–200 packs son una meta de curación, no un conteo garantizado: la disponibilidad y las equivalencias entre tiendas deben comprobarse primero.
