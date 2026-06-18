# Comparador de precios de juegos digitales en Argentina

MVP auditable en Next.js + TypeScript para comparar una muestra fija de juegos entre Steam, Epic, GOG, Humble y Microsoft Store.

## Correr

```bash
npm install
npm run build:game-sample
npm run refresh:prices
npm run dev
```

Luego abrir `http://localhost:3000`.

## Actualizar datos

- `data/game-candidates.json`: candidatos curados. No incluir F2P, DLC, demos, soundtracks, bundles, ediciones deluxe salvo necesidad, retirados o solo consola.
- `data/manual-store-matches.json`: equivalencias manuales cuando el slug o URL no está en el candidato.
- `data/manual-prices.json`: precios cargados manualmente para cualquier caso donde no haya fetch estable. No inventar precios; dejar vacío si no hay fuente.
- `npm run build:game-sample`: valida cobertura por tienda y genera `data/generated/game-sample.json`.
- `npm run refresh:prices`: consulta providers disponibles, conserva cache válida en `data/generated/latest-prices.json` si falla un refresh y agrega snapshots a `data/generated/price-history.json`.
- `PRICE_REFRESH_LIMIT=100 PRICE_REFRESH_OFFSET=0 npm run refresh:prices`: actualiza una tanda y mergea el resultado en el cache vigente. Este es el modo recomendado para catalogos grandes.
- `npm run refresh:missing-prices`: recorre solo tandas con juegos sin precio o con `fetch failed`, usa concurrencia controlada y escribe progreso en `data/generated/refresh-missing-status.json`.
- `npm run refresh:regional-prices`: actualiza por tandas todas las regiones configuradas en `PRICE_REGIONS` y escribe caches separados (`latest-prices-MX.json`, `latest-prices-ES.json`, etc.). Es el comando recomendado para servidor/cron.
- `npm run refresh:regional-prices:bg`: lanza el actualizador regional en segundo plano en Windows. El progreso queda en `data/generated/regional-refresh-status.json` y, por pais, en `data/generated/regional-refresh-status-MX.json`, `regional-refresh-status-ES.json`, etc. Los logs quedan en `data/generated/regional-refresh.log` y `data/generated/regional-refresh.err.log`.
- `npm run audit:microsoft-prices`: genera `data/generated/microsoft-price-audit.json` con precios Microsoft sin timestamp, descuentos grandes, datos manuales, juegos esperados sin product id y filas no disponibles.
- `PRICE_REGION=AR PRICE_REFRESH_LIMIT=100 PRICE_REFRESH_OFFSET=0 npm run refresh:microsoft-prices`: revalida solo Microsoft Store por tandas. Si Microsoft falla por red, conserva el ultimo precio valido pero lo marca como pendiente de actualizacion.
- `npm run prices:backfill-steamspy`: completa precios Steam faltantes desde SteamSpy cuando `appdetails` queda bloqueado/rate-limited. La fuente queda marcada como `steamspy` en el cache para auditoria.
- `npm run prices:backfill-itad-regional`: usa ITAD para completar precios actuales regionales de Steam, Epic, GOG y Humble en tandas de hasta 200 juegos por request. No reemplaza Microsoft, que sigue con provider propio.
- `npm run audit:regional-sample`: genera `data/generated/regional-audit-sample.json`, una cohorte comun para comparar regiones con la misma cantidad de juegos auditados.
- `npm run catalog:discover-steam`: genera `data/generated/steam-discovery-candidates.json` con intake revisable desde SteamSpy, priorizando juegos pagos con volumen de reviews. No modifica `game-candidates.json` automaticamente.
- `npm run catalog:promote-discovered`: aprueba en masa el intake descubierto, deduplica por titulo/Steam App ID, exige volumen de reviews/owners y reconstruye `game-sample.json`.
- `npm run releases:discover`: discovery diario de lanzamientos recientes desde Steam Search. Escribe `data/generated/pending-releases.json`; no toca el catalogo.
- `npm run releases:promote`: promueve releases pendientes al catalogo. Usa `RELEASE_PROMOTE_MODE=fast` para fast lane diario o `weekly` para tandas semanales.

## Metodología

`strictSample` incluye juegos con match usable en las 5 tiendas. `broadSample` permite faltantes para mostrar cobertura real y casos útiles para revisar. Cada precio conserva moneda y valor oficial original. La UI separa precio oficial de la estimación en pesos con dólar tarjeta e IVA de servicios digitales.

La conversión a ARS usa DolarAPI (`/v1/dolares/tarjeta`) y toma el valor de venta del dólar tarjeta. Si la consulta falla, usa `USD_TO_ARS` como fallback editable, por defecto `1852.50`. El IVA digital se define en `DIGITAL_VAT_RATE`, por defecto `0.21`.

## Regiones

Regiones soportadas: `AR`, `MX`, `ES`, `PE`, `CL`. Para correr una carga regional completa:

```bash
PRICE_REGIONS=MX,ES,PE,CL PRICE_REFRESH_BATCH_SIZE=50 PRICE_REFRESH_CONCURRENCY=4 PRICE_REFRESH_SLEEP_MS=2500 npm run refresh:regional-prices
```

En PowerShell:

```powershell
$env:PRICE_REGIONS="MX,ES,PE,CL"
$env:PRICE_REFRESH_BATCH_SIZE="50"
$env:PRICE_REFRESH_CONCURRENCY="4"
$env:PRICE_REFRESH_SLEEP_MS="2500"
npm run refresh:regional-prices
```

Para cortar y retomar, el script conserva caches validos y vuelve a procesar tandas sin precio o con `fetch failed`. Para una corrida diaria, usar el mismo comando a las 14:30 Argentina. En servidores Linux equivale a `30 17 * * *` si el servidor corre en UTC.

Variables utiles:

- `PRICE_REGIONS`: paises a actualizar, separados por coma.
- `PRICE_REGION`: pais unico para `refresh:prices` o `refresh:missing-prices`.
- `PRICE_REFRESH_BATCH_SIZE`: cantidad de juegos por tanda.
- `PRICE_REFRESH_CONCURRENCY`: pedidos simultaneos dentro de una tanda.
- `PRICE_REFRESH_SLEEP_MS`: pausa entre tandas.
- `PRICE_REFRESH_MAX_BATCHES`: limite opcional para corridas de prueba.

El auditador regional define tres bases:

- `regionalComparable`: juegos con precio en 2 o mas tiendas en cada region seleccionada.
- `regionalStrict`: juegos con precio en las 5 tiendas en cada region seleccionada.
- `regionalStoreComparable`: juegos disponibles en la misma tienda para todas las regiones.

Endpoint util: `/api/regional-audit` devuelve el ultimo audit generado.

## Produccion y cron

Antes de publicar, revisar `/api/health`: devuelve `ok: true` solo si estan las variables criticas (`ITAD_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).

Endpoint protegido para cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://tu-dominio.com/api/cron/refresh?regions=AR,MX,ES,PE,CL&batchSize=50&maxBatches=1"
```

Parametros utiles:

- `regions`: regiones a actualizar, separadas por coma. Si se omite, usa `PRICE_REGIONS` o todas.
- `batchSize`: juegos por tanda.
- `maxBatches`: tandas por region en esa ejecucion. Para hosting con timeout bajo, usar `1`.
- `offset`: posicion inicial de la tanda. Si se omite, el endpoint usa `data/generated/price-refresh-cursor.json` y continua automaticamente donde quedo cada region.
- `refreshItad=1`: refresca minimos ITAD despues de actualizar precios actuales.
- `force=1`: fuerza la ejecucion aunque no sea un dia programado.

Cadencia recomendada para precios: lunes, miercoles, viernes y domingo a las 14:30 Argentina, despues del horario habitual de cambio de ofertas. En UTC equivale a `30 17 * * 0,1,3,5`. El endpoint ya trae esa ventana por defecto (`PRICE_REFRESH_DAYS=1,3,5,0`) y saltea otros dias salvo `force=1`. Si el hosting corta requests largos, dejar `maxBatches=1`; el cursor automatico avanza una tanda por llamada y vuelve a `0` al completar el catalogo.

Para produccion, el refresh queda preparado para ejecuciones cortas y repetibles:

- `/api/cron/refresh` usa lock con TTL (`PRICE_REFRESH_LOCK_TTL_MS`) para evitar solapamientos.
- El estado queda en `data/generated/price-refresh-status.json`.
- El cursor queda en `data/generated/price-refresh-cursor.json`.
- `/api/refresh/status` expone estado, cursor y locks para monitoreo rapido.
- El esquema inicial de MySQL para precios, historicos, jobs y locks esta en `data/schema/pricing-mysql.sql`.

Automatizacion de releases:

```bash
# Diario: detectar lanzamientos y promover solo fast lane.
curl -H "Authorization: Bearer $CRON_SECRET" "https://tu-dominio.com/api/cron/releases?mode=all"

# Semanal: promover tanda limitada de pendientes.
curl -H "Authorization: Bearer $CRON_SECRET" "https://tu-dominio.com/api/cron/releases?mode=weekly"
```

Calendario recomendado:

- Diario 13:00 AR: `/api/cron/releases?mode=all`. Descubre releases recientes y promueve solo fast lane.
- Lunes, miercoles, viernes y domingo 14:30 AR: `/api/cron/refresh?...`. Actualiza precios.
- Semanal lunes 12:00 AR: `/api/cron/releases?mode=weekly`. Promueve hasta `RELEASE_PROMOTE_LIMIT` pendientes con umbrales de reviews/owners.

Reglas por defecto:

- Discovery mira `RELEASE_DISCOVERY_LOOKBACK_DAYS=90`.
- Fast lane entra si el release reciente aparece muy alto en Steam Search o ya tiene senal fuerte de reviews/owners.
- Promocion semanal agrega maximo `RELEASE_PROMOTE_LIMIT=75`.
- Los candidatos rechazados quedan en `pending-releases.json` con razon; los promovidos se marcan `promoted`.

Importante para Hostinger: los JSON en `data/generated` sirven como cache auditable local, pero no son almacenamiento ideal para usuarios, wishlist y alertas en produccion. Antes de abrir trafico real, mover esos datos a una DB persistente; el endpoint cron ya queda aislado para que el cambio de storage no afecte la UI.

## Usuarios y wishlist persistente

La app usa una capa de storage para usuarios, wishlist, campanitas y ajustes de notificacion.

- Sin DB configurada, guarda en `data/generated/users.json` para desarrollo local.
- Con `DATABASE_URL` o `MYSQL_HOST`, usa MySQL/MariaDB y crea las tablas automaticamente en el primer request de usuario.

Formato recomendado para `DATABASE_URL`:

```bash
DATABASE_URL=mysql://usuario:password@host:3306/base
```

Tambien se puede configurar por partes, util en Hostinger:

```bash
MYSQL_HOST=...
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
MYSQL_CONNECTION_LIMIT=5
MYSQL_SSL=0
```

Tablas creadas:

- `users`: perfil Google, timestamps y ajustes globales de notificacion.
- `wishlist_items`: juegos guardados, fecha de agregado, campanita y preferencias por juego.

Para migrar datos locales existentes, primero configurar la DB en `.env.local` y luego iniciar la app; las tablas se crean solas. Si ya hay usuarios en `data/generated/users.json`, se puede hacer una migracion puntual con un script de importacion antes de publicar.

Providers incluidos:

- Steam: usa `appdetails` con `cc=AR&l=spanish`.
- GOG: consulta la página con `currencyCode=USD&countryCode=AR` y extrae `window.productcardData`.
- Humble: usa la búsqueda pública de Algolia del store y toma precios USD regionales para AR cuando hay match exacto/seguro.
- Microsoft Store: si se carga `identifiers.microsoftProductId`, usa el catálogo público `displaycatalog.mp.microsoft.com` con `market=AR`. También intenta extraer el product id desde `microsoftUrl`; si no puede, cae al parseo conservador del HTML es-AR.
- Epic: usa Egdata (`/search/v2/search?country=AR`) como fuente conectada de precios regionales AR, porque la tienda oficial bloquea consultas anónimas desde este entorno. El proveedor conserva el raw para auditoria y permite override en `manual-prices.json`.

La UI calcula índice de precios por tienda tomando el precio más barato de cada juego como `+0%` y mostrando el resto como `+X%`, juegos en oferta por tienda, descuento promedio por tienda, victorias totales, victorias con oferta y victorias sin oferta.

## Históricos

El histórico propio se construye con cada refresh y no inventa datos hacia atrás: `data/generated/price-history.json` representa precios observados desde que se empezó a capturar. La biblioteca muestra, por juego, el mínimo histórico disponible para cada tienda en una banda compacta.

ITAD es opcional. Para traer mínimos históricos de Steam, Epic, GOG y Humble con región Argentina, crear una app en IsThereAnyDeal y configurar `ITAD_API_KEY`. Las credenciales OAuth (`client id` y `client secret`) son para endpoints de datos de usuario; los endpoints públicos de lookup/precios usan API key. El refresh usa `country=AR`, guarda el cache en `data/generated/itad-history.json` y deja Microsoft fuera de ITAD porque no aparece como fuente comparable estable en ese API; Microsoft queda cubierto por histórico propio.

Endpoint útil: `/api/history` devuelve mínimos propios + ITAD cacheado. `/api/history?refreshItad=1` intenta refrescar ITAD sin tocar precios actuales.

La biblioteca abre un modal por juego desde la portada o la banda de mínimos. El modal muestra precios actuales, mínimos por tienda y un gráfico de evolución histórica en ARS normalizado. El gráfico usa snapshots propios y, si `ITAD_API_KEY` está configurada, también `games/history/v2` desde `ITAD_HISTORY_SINCE`.

## Escalado publico

La biblioteca ya consume `/api/catalog`, no `/api/prices` completo. Ese endpoint aplica busqueda, categoria, filtro, orden, `limit` y `offset` del lado servidor, devuelve solo la pagina visible y compacta el `raw` de proveedores para no mandar payloads gigantes al navegador.

La comparativa global vive en `/comparativa-general` y consume `/api/stats`, que devuelve agregados sin mandar todos los juegos ni el `raw` completo.

Ejemplo: `/api/catalog?mode=broad&query=cyberpunk&filter=ofertas&sort=precio&limit=60&offset=0`.

Para llegar a 2.000 juegos sin romper la experiencia, el criterio de seleccion recomendado es:

- Priorizar juegos PC pagos con pagina vigente en Steam y al menos una fuente adicional verificable.
- Incluir top sellers/most played de Steam, publishers grandes, indies con alto volumen de reviews, AA recientes, clasicos persistentes y juegos con presencia Xbox/Microsoft cuando sean comparables en PC.
- Evitar F2P, DLC, demos, soundtracks, packs, juegos retirados, solo consola y ediciones que mezclen contenido no comparable.
- Marcar todo match dudoso como `manual_review_needed` o `uncertain_match` antes de dejarlo influir en rankings publicos.

Para mediano plazo, el salto correcto es mover `game-candidates`, precios actuales e historicos a base de datos, y ejecutar refresh por lotes con cola/rate limits por tienda. Los JSON actuales siguen siendo utiles como seed auditable y cache local, pero no deberian ser el unico storage cuando el catalogo pase de miles de juegos o haya trafico publico real.
