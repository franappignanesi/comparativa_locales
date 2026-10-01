# Reportes revisados

## Alineacion de Juego del finde

El titulo y el boton de video ahora estan dentro de la card destacada.
Su borde superior queda alineado con las cuatro metricas, sin alturas
fijas ni desplazamientos que fallen al cambiar el ancho o el titulo.

## Microsoft Store

Los tres juegos estaban declarados solo para Steam; Microsoft nunca
se consultaba. Se agregaron matches explicitos de edicion estandar
con compra para Windows.Desktop verificada en el catalogo oficial AR:

- Kingdom Come: Deliverance II: 9N4W31HSMVVD.
- Visage: 9P9V698V6MVR.
- Injustice 2, Standard Edition PC: 9PHT4W7WBBDQ.

Los matches tambien se aplican al leer un catalogo anterior desde cache.
El adaptador descarta ofertas exclusivas de consola cuando Microsoft
declara las plataformas permitidas y limita los pedidos a 12 segundos.
No se invento el descuento historico del 12/7 para Kingdom Come.

## FC 27 y otros lanzamientos

El artefacto catalog-state tenia FC 27 aprobado, pero sus archivos se
descargaban en la raiz del checkout. GitHub elimina el prefijo comun data
al subir ese artefacto: ambos consumidores deben descargarlo en data.
El refresh y el deploy estaban usando otro catalogo.

Se recuperaron 23 incorporaciones pagas verificadas en Steam del ultimo
artefacto, incluyendo FC 27, NBA 2K27 y Madden NFL 27. El descubrimiento
preserva los juegos del catalogo publicado aunque no esten en el source
del checkout; la lectura preserva incorporaciones nuevas del source aunque
el cache anterior aun no las tenga. Ahora se revisa el top 100 diariamente;
el backfill de juegos antiguos mantiene su frecuencia quincenal.

Tambien se parsea el HTML de Steam con Cheerio para conservar la relacion
entre titulo y app ID, y se piden fechas en ingles para Date.parse.
Los pedidos externos tienen timeout; un error de busqueda no se informa
como una corrida exitosa sin juegos nuevos.

El workflow permite target_game_ids para cargar una correccion acotada
en todas las regiones, reutilizando el pipeline habitual y preservando
los precios e historiales de los demas juegos. Ningun reporte se marco
como resuelto ni se envio feedback de moderacion.
