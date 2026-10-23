# Publication Studio

Admin > Reportes > Publicaciones preserves the existing offer carousel and adds
game stories, news, horizontal bar charts, versus publications and giveaways.

## Editorial model

- Each new generator has its own versioned IndexedDB draft, including uploaded
  images. Drafts are local to the browser, not shared between administrators.
- News and versus sequences are freely assembled from supported plate types.
  Plates can repeat, be duplicated, reordered or removed, including the closing.
- Both formats use native export dimensions: 1080 x 1350 and 1080 x 1920.
  The fifteen-image limit includes every plate in the sequence.
- Stories have an optional blank link-sticker area. Its preview border is not
  included in exported images.
- Versus cover and price-comparison plates have independent horizontal and
  vertical crop sliders for each game's cover, grouped in named collapsible panels.
- Giveaways start with announcement and winner plates. They show the selected
  game's title and cover, never prices, and support one to five named winners.
  Announcements optionally reserve story-link space or show a post-description
  invitation. Hiding either element returns its space to the artwork.
- Uploads accept PNG, JPEG and WebP, validate signatures, cap input size at 10 MB
  and decoded resolution at 40 MP, then resize to a maximum edge of 2200 pixels.

## Prices and export

Catalog data still comes from the existing session-protected admin endpoint.
Drafts retain game identities and editorial choices, not snapshots of prices.
Restoring a draft reloads the selected games; refresh and country changes reload
their cached prices without starting a scraping job.

New price plates exclude stale and missing prices. Cheapest markers use converted
comparison amounts, not nominal prices in different currencies. Selected stores
also constrain the accompanying ZIP caption. Native currencies, consultation
dates and the existing historical-low validation are preserved.

The shared browser exporter waits for fonts and images, rejects overflowing
content, and renders sequentially to PNG or ZIP with an accompanying text file.
It adds no rendering service or external API dependency.

## Verification

Run `node --import tsx --test scripts/*.test.ts scripts/*.test.tsx` and
`npm run build`.

Browser checks cover uploads, duplicate/reorder/remove operations, independent
draft restoration, mobile width, both native dimensions, PNG and ZIP output,
the five-store versus layout and legacy carousel export. Layout tests use
synthetic fresh prices, not claims about live offers.
