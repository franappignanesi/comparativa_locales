self.addEventListener("push", (event) => {
  event.waitUntil(showWishlistNotification());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/wishlist"));
});

async function showWishlistNotification() {
  let title = "BARATEAM";
  let body = "Tenés novedades en tu wishlist.";
  try {
    const alerts = await fetchAlerts();
    const firstAlert = alerts[0];
    if (firstAlert) {
      title = firstAlert.gameTitle ?? title;
      body = alerts.length === 1 ? firstAlert.message ?? body : `Tenés ${alerts.length} alertas de precio en tu wishlist.`;
    }
  } catch {
    // A generic notification is still useful if the app cannot fetch alert details.
  }
  await self.registration.showNotification(title, {
    body,
    icon: "/store-logos/steam.png",
    badge: "/store-logos/steam.png",
    data: { url: "/wishlist" }
  });
}

async function fetchAlerts() {
  const regions = ["AR", "MX", "ES", "PE", "CL"];
  const responses = await Promise.all(
    regions.map((region) =>
      fetch(`/api/user/wishlist-alerts?region=${region}`, { credentials: "include" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
    )
  );
  return responses.flatMap((payload) => (Array.isArray(payload?.alerts) ? payload.alerts : []));
}
