import assert from "node:assert/strict";
import { test } from "node:test";
import { wishlistNotificationKey } from "../src/lib/wishlist-notification-key";
import { buildDiscordWishlistMessage } from "../src/lib/discord-messages";
import type { WishlistAlert } from "../src/lib/wishlist-alerts";

const alert: WishlistAlert = {
  userId: "test", region: "AR", gameId: "test-game", gameTitle: "Juego de prueba", store: "steam",
  type: "price_drop", message: "Bajó 25%", triggeredAt: "2026-10-02T00:00:00Z",
  currentOfficialPrice: 9, currentCurrency: "USD", currentArsPrice: 12000
};

test("the same offer is not repeated tomorrow or under a different condition", () => {
  const key = wishlistNotificationKey(alert);
  const tomorrow: WishlistAlert = { ...alert, triggeredAt: "2026-10-03T00:00:00Z" };
  assert.equal(key, wishlistNotificationKey(tomorrow));
  assert.equal(key, wishlistNotificationKey({ ...alert, type: "historical_low" }));
  assert.equal(key, wishlistNotificationKey({ ...alert, type: "below_usd", thresholdUsd: 10 }));
  const exchangeRateChange: WishlistAlert = { ...alert, currentArsPrice: 12500 };
  assert.equal(key, wishlistNotificationKey(exchangeRateChange));
  for (const change of [{ currentOfficialPrice: 8 }, { currentCurrency: "EUR" }, { region: "MX" as const }, { store: "gog" as const }]) {
    assert.notEqual(key, wishlistNotificationKey({ ...alert, ...change }));
  }
});

test("Discord uses a human message for each condition without inventing a new threshold crossing", () => {
  const text = (item: WishlistAlert) => JSON.stringify(buildDiscordWishlistMessage([item]));
  assert.match(text(alert), /Me pediste que te avise.*baje de precio/);
  assert.match(text({ ...alert, type: "historical_low" }), /mínimo registrado/);
  const threshold = text({ ...alert, type: "below_usd", thresholdUsd: 10 });
  assert.match(threshold, /USD 10 o menos/);
  assert.match(threshold, /Ya cumple ese límite/);
  assert.doesNotMatch(threshold, /acaba de/);
  assert.match(threshold, /modificar las condiciones/);
  assert.match(threshold, /¡Saludos!/);
  assert.match(threshold, /\/juegos\/test-game/);
  assert.match(JSON.stringify(buildDiscordWishlistMessage([{ ...alert, message: "Prueba: no es una nueva rebaja" }], { trial: true })), /no es una nueva rebaja/);
});
