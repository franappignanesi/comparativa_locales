# Price pipeline audit: 2026-10-19

## Verified causes

- Microsoft search missed `Forza Horizon 5: Edicion Estandar` because only English edition words were normalized. Its Standard Edition and Forza Horizon 6 are purchase bundles: their PC entitlement is explicitly guaranteed by Xbox Play Anywhere (XPA), but they have no package of their own. Discovery required a directly attached executable package and rejected them.
- Curator imports updated recommendations and deployed them, but did not add new recommendations to the refreshable sample. The card fallback therefore showed Tenebris Somnia without prices even after the daily worker completed successfully.
- Steam multi-app requests included `basic` together with `price_overview`; the source returns HTTP 400 for that combination. Price-only requests succeed. The daily workflow had native Steam disabled; AR snapshots therefore often contained USD reconstructed from ITAD's converted ARS prices, producing daily currency noise.
- The chart started its price axis at the lowest observation. Tiny differences could occupy the entire chart height. Exact-price-only marker compaction did not remove the daily noise.

## Changes and safeguards

- Normalize Spanish standard-edition labels. Accept purchase bundles only with explicit XPA and active Windows.Desktop purchase availability. Console-only, expired, trial and premium listings remain excluded.
- Pin verified Forza Standard Edition mappings: FH5 `9NKX70BBCDRN`, FH6 `9N431PX143P8`. Version discovery progress so old negative results are retried while verified matches survive.
- Add video recommendations to the sample by exact Steam app ID, idempotently and without replacing title collisions.
- Curator import calls the daily refresh workflow and waits for all regional prices and deployment before completing. Every checkout uses the new committed recommendation list. Weekly digest completion hooks therefore run after prices are published.
- Use supported Steam price-only batches and enable native Steam in the daily refresh in all five countries.
- Mark reconstructed AR Steam fallback prices as estimated. Do not append those, or stale prices, as exact observations or send wishlist alerts for them. Preserve native price-source provenance in new snapshots.
- Start chart axes at zero and reduce dense markers; all price observations remain in the line and archives. No historical values were deleted or invented.

## Live source validation

Both Forza titles resolved automatically with the corrected discovery code. Direct Steam and Microsoft reads succeeded in AR, MX, ES, PE and CL.

Argentina, without taxes: FH5 Microsoft ARS 26,399 / Steam USD 32.78; FH6 Microsoft ARS 79,999 / Steam USD 48.99; Tenebris Somnia Steam USD 3.99 (-20%). Values are observations from the audit, not permanent overrides.

## Publication follow-through

After approval: publish code, run a targeted refresh for `forza-horizon-5,forza-horizon-6,tenebris-somnia` in all five regions, then a bounded full Microsoft discovery audit and price refresh. Check the public API after deployment. Old snapshots whose native provenance is unknown remain archived; this patch does not claim to reconstruct missing historical facts.
