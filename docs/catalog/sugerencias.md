# Propuestas de juegos de la comunidad

## Flujo

- Sugerencias > Proponer un juego faltante permite enlaces oficiales de Steam (app/sub), Epic, GOG, Humble o Microsoft.
- Requiere sesion server-side. La vista previa consulta solo endpoints conocidos o rutas canonicas permitidas, sin seguir redirects y con limite de tiempo/tamano.
- Si no se obtiene el nombre, el usuario puede dejarlo escrito. Ese nombre no se considera identidad verificada: el worker vuelve a consultar la fuente antes de construir una ficha.
- Los enlaces equivalentes de una tienda se agrupan; cada usuario cuenta una sola vez como solicitante. Propuestas de distintas tiendas pueden converger al mismo juego durante la busqueda.
- Las propuestas y solicitantes se guardan en tablas independientes de Neon. No van al cache publico ni al repositorio.

## Administracion

En /admin/reportes, la pestana Juegos sugeridos ofrece buscar coincidencias, buscar los pendientes, aprobar (Agregar) y descartar. Descartar conserva el registro. La aprobacion nunca acepta un candidato enviado desde el navegador.

Las busquedas quedan en cola para el refresh diario. Cada corrida procesa hasta 10 busquedas con un presupuesto de cinco minutos, pausas de Steam y timeout por request. Los botones no disparan workers publicos ni necesitan un token de GitHub dentro de Vercel.

La busqueda exige identidad ITAD y titulo/edicion exactos. Comprueba juego PC, evita DLC y requiere precio de la tienda propuesta. Packs requieren otra tienda y, para packages de Steam, un juego base PC verificable. Los errores o coincidencias dudosas quedan para revision; puede reencolarse la busqueda.

Los estados approved/publishing se incorporan al catalogo en la siguiente corrida, sin aplicarles el objetivo de 5.000 de la expansion automatica. La incorporacion recupera tambien fichas publicadas desde cache para no perderlas al reconstruir la muestra.

Despues de un deploy exitoso, --confirm-published consulta produccion y confirma slug, identidad ITAD y algun precio disponible. Solo entonces pasa a published. Los publishing pendientes se reintentan en futuros refresh si fallo la actualizacion o el deploy.

## Limites y configuracion

Usa los secretos existentes POSTGRES_URL e ITAD_API_KEY de Actions y la configuracion Postgres existente de Vercel. No requiere claves nuevas.

Limites atomicos: 20 vistas previas por 10 minutos/usuario, 5 envios por 24 horas/usuario, 2.000 solicitudes diarias globales y 60 operaciones admin por 10 minutos. JSON entrante maximo 4 KB. Claims de busqueda expiran en diez minutos; tras tres claims interrumpidos quedan para revision.

Tablas: game_suggestions, game_suggestion_supporters, game_suggestion_limits. Lazy-init independiente de app_json_state, que el mantenimiento de precios puede vaciar. Se limpian buckets expirados, no registros de propuestas.

## Verificacion

scripts/game-suggestions.test.ts cubre parsing, SSRF, origen, limite de payload, auth, ediciones, precios, identidad y orden de publicacion. Los datos publicos y el estado de propuestas son sistemas distintos; no marcar Published solo por escribir game-sample.json.
