import assert from "node:assert/strict";
import { test } from "node:test";
import { findMicrosoftPrice } from "../src/lib/stores/microsoft";

function availability(price: number, platform: string, end = "2099-01-01") {
  return { Actions: ["Purchase"], Conditions: { StartDate: "2020-01-01", EndDate: end, ClientConditions: { AllowedPlatforms: [{ PlatformName: platform }] } }, OrderManagementData: { Price: { ListPrice: price, MSRP: 1399, CurrencyCode: "ARS" } } };
}
test("Microsoft takes active PC sale prices, not expired or console-only offers", () => {
  const product = { Availabilities: [availability(1399, "Windows.Desktop"), availability(139.9, "Windows.Desktop"), availability(1, "Windows.Xbox"), availability(50, "Windows.Desktop", "2020-01-02")] };
  assert.deepEqual(findMicrosoftPrice(product), { basePrice: 1399, finalPrice: 139.9, currency: "ARS" });
});
test("Microsoft console-only listings do not become PC prices", () => {
  assert.equal(findMicrosoftPrice({ Availabilities: [availability(139.9, "Windows.Xbox")] }), null);
});
