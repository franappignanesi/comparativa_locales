self.addEventListener("push", (event) => {
  event.waitUntil(showWishlistNotification());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/wishlist"));
});

async function showWishlistNotification() {
  let title = "GLITCHPRICE";
  let body = "Tenés novedades en tu wishlist.";
  try {
    const response = await fetch("/api/user/wishlist-alerts?region=AR", { credentials: "include" });
    if (response.ok) {
      const payload = await response.json();
      const alert = payload.alerts?.[0];
      if (alert) {
        title = alert.gameTitle ?? title;
        body = alert.message ?? body;
      }
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
