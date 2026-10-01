# Microsoft PC catalog coverage

## Root causes

- Only games already marked as Microsoft-compatible were searched. Steam release discovery added Steam-only candidates, so Microsoft coverage could never grow automatically.
- The exact-title matcher rejected annual standard names such as `Sea of Thieves: 2026 Edition`.
- Candidates with only a Microsoft product ID were not counted as matched unless Microsoft was also listed in expected stores.

## Fixes

- Sea of Thieves has an explicit verified standard PC product ID: `9P2N57MC619K`.
- Standard annual suffixes and `for Windows` / `for PC` are normalized. Premium, Deluxe, unrelated titles and DLC remain excluded.
- The daily catalog job discovers up to 150 missing Microsoft mappings with three workers, 12-second request timeouts and a four-minute soft runtime budget.
- Positive mappings require an active PC purchase and a non-trial Windows.Desktop installation package. Bundles without directly verifiable PC packages are deliberately left to existing/manual mappings rather than guessed.
- Negative results are checked again after 30 days. Network errors are not recorded as absent products.
- Mappings and check dates are public JSON in `data/generated/microsoft-discovery.json`, restored/saved with GitHub cache and passed in the catalog artifact to all five regions and deployment. No price data or discovery payloads are added to Neon.
- Explicit manual IDs/URLs take precedence. Existing refresh, history and notification mechanisms remain in place.

## Initial audit

The first 150 searches returned 76 potential mappings; 69 also passed the stricter installation-package check. Six confirmed PC games had not previously been marked for Microsoft: Baldur's Gate 3, Hades II, Ready or Not, Final Fantasy VII Remake Intergrade, The Case of the Golden Idol and The Talos Principle 2.

This is an incremental coverage audit, not a claim that every catalog game is sold in Microsoft. Translated or substantially renamed editions can still require manual review. Prices are refreshed separately by the existing region workers.
