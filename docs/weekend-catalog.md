# Juego del finde: incorporaciones al catalogo

`data/weekend-catalog-additions.json` contiene juegos de Mentor con video,
verificados por Steam e incorporados fuera del descubrimiento automatico.
La primera importacion agrego 40 juegos (36 pagos y 4 gratuitos).

`scripts/add-weekend-catalog.ts` es una importacion idempotente: verifica
app IDs y tipo de producto, sin adivinar identificadores de otras tiendas.
Los errores de Steam no se convierten en entradas inventadas.

El constructor integra las incorporaciones al catalogo normal. La lectura
tambien las agrega a un dataset anterior recuperado desde GitHub Cache,
conservando todos los juegos, precios e historiales preexistentes. Los
refresh diarios consultan estos juegos igual que los demas.

Para cargar solo sus precios inmediatamente, ejecutar el workflow diario
con `weekend_games_only=true`. Usa los mismos adaptadores, normalizacion,
merge y almacenamiento que el refresh normal, limitando los pedidos a las
incorporaciones. No modifica el cursor del refresh completo ni reemplaza
los precios de los otros juegos. El modo diario predeterminado no cambia.

La biblioteca incluye la recomendacion mas reciente con video, su card
normal y sus precios regionales. Solo se carga el video al abrirlo, no
en cada visita a la biblioteca.
