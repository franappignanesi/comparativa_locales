# Importacion del Mentor de Shux

La lista para revisar esta en `docs/juegos-del-finde.md` y su version para planillas en `docs/juegos-del-finde.csv`. Los datos para BARATEAM estan en `data/shux-weekend-games.json`, vinculados por Steam App ID.

El workflow `Import Shux weekend games` se ejecuta los sabados a las 19:00 de Argentina (22:00 UTC). GitHub Actions puede demorar el inicio; el horario no garantiza puntualidad exacta. Tambien puede ejecutarse manualmente desde Actions.

Para actualizar localmente:

```sh
npm run shux:import-curator
```

Se importan las resenas paginadas del Mentor 35362522. Se conserva el tipo de resena, el texto y la fecha tal como Steam los muestra. Los enlaces de Instagram, YouTube y TikTok se extraen de la resena completa, sin consultar esas plataformas. Si no hay enlace, queda vacio. La pertenencia a Juego del finde se basa en el Mentor; no se intenta clasificar videos de otras fuentes.

La importacion tiene timeout y reintentos. Si Steam falla o cambia su HTML, no reemplaza la lista existente por una lista parcial. Las entradas que desaparecen de Steam se conservan. Sin cambios no se genera un commit. Con cambios el bot guarda solo los tres archivos de la lista en main y adjunta una copia como artifact. No requiere nuevos secrets ni usa Neon.

Este workflow no modifica los caches de precios ni inicia un refresh. La integracion visual en las cards de BARATEAM queda pendiente de revisar la lista. Las listas generadas se reemplazan en cada importacion: las correcciones editoriales permanentes deberan incorporarse al importador o a un archivo de overrides cuando se integre la UI.
