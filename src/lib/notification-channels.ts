import { createPrivateKey, createSign } from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import { listPushSubscriptionsForUser, type StoredPushSubscription } from "./push-subscription-store";
import type { StoredUser } from "./user-store";
import type { WishlistAlert } from "./wishlist-alerts";

export async function sendEmailAlerts(user: StoredUser, alerts: WishlistAlert[]): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !user.email || !alerts.length) return 0;
  const from = process.env.EMAIL_FROM || "BARATEAM <barateam@shuxteam.com>";
  const subject = alerts.length === 1 ? `Alerta de precio: ${alerts[0].gameTitle}` : `Tenés ${alerts.length} alertas de precio en BARATEAM`;
  const html = buildWishlistEmailHtml(user, alerts);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: user.email, subject, html })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[notifications] resend failed", { status: response.status, text: text.slice(0, 300) });
    return 0;
  }
  return 1;
}

export async function sendWebPushAlerts(user: StoredUser, alerts: WishlistAlert[]): Promise<number> {
  if (!alerts.length) return 0;
  const subscriptions = await listPushSubscriptionsForUser(user.sub);
  let sent = 0;
  for (const subscription of subscriptions) {
    if (await sendEmptyPush(subscription)) sent += 1;
  }
  return sent;
}

async function sendEmptyPush(subscription: StoredPushSubscription): Promise<boolean> {
  const vapid = getVapidConfig();
  if (!vapid) return false;
  const audience = new URL(subscription.endpoint).origin;
  const token = signVapidJwt(audience, vapid.subject, vapid.privateKey);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`
    }
  }).catch((error) => {
    console.error("[notifications] push failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  if (!response) return false;
  if (response.ok || response.status === 201 || response.status === 202) return true;
  console.error("[notifications] push rejected", { status: response.status });
  return false;
}

function buildWishlistEmailHtml(user: StoredUser, alerts: WishlistAlert[]): string {
  const items = alerts
    .map(
      (alert) => `
        <li style="margin:0 0 14px 0;padding:14px;border:1px solid #e6e1d2;border-radius:10px;list-style:none;background:#fffaf0">
          <strong style="display:block;font-size:17px;margin-bottom:6px;color:#15130d">${escapeHtml(alert.gameTitle)}</strong>
          <span style="display:block;color:#5d4200;font-weight:700;margin-bottom:8px">${escapeHtml(alert.message)}</span>
          <span style="display:block;color:#15130d">Ahora: <strong>${escapeHtml(formatAlertPrice(alert))}</strong></span>
          ${alert.previousArsPrice ? `<span style="display:block;color:#5d6470">Antes aprox.: ${escapeHtml(formatArs(alert.previousArsPrice))}</span>` : ""}
          <small style="display:block;margin-top:8px;color:#6c7280">${escapeHtml(STORE_LABELS[alert.store])} - Region ${escapeHtml(alert.region)}</small>
        </li>`
    )
    .join("");
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="color-scheme" content="light" />
      </head>
      <body style="margin:0;padding:0;background:#f4f1e8">
        <div style="font-family:Arial,sans-serif;line-height:1.45;color:#161616;max-width:620px;margin:0 auto;padding:28px 18px">
          <div style="background:#f7b500;border-radius:18px 18px 0 0;padding:18px 20px">
            <h1 style="font-size:24px;margin:0;color:#111;font-weight:900;letter-spacing:0">BARATEAM</h1>
          </div>
          <div style="background:#ffffff;border:1px solid #e6e1d2;border-top:0;border-radius:0 0 18px 18px;padding:22px 20px">
            <p style="font-size:16px;margin:0 0 18px 0">Hola ${escapeHtml(user.name || "jugador")}, encontramos novedades en tu wishlist.</p>
            <ul style="padding:0;margin:0">${items}</ul>
            <p style="margin:22px 0 0 0">
              <a href="${escapeHtml(siteUrl())}/wishlist" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:11px 18px;font-weight:700">Ver mi wishlist</a>
            </p>
          </div>
        </div>
      </body>
    </html>`;
}

const STORE_LABELS: Record<WishlistAlert["store"], string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft"
};

function formatAlertPrice(alert: WishlistAlert): string {
  if (alert.currentOfficialPrice != null && alert.currentCurrency) {
    return `${alert.currentCurrency.toUpperCase()} ${formatNumber(alert.currentOfficialPrice)}`;
  }
  if (alert.currentArsPrice != null) return formatArs(alert.currentArsPrice);
  return "Precio actualizado";
}

function formatArs(value: number): string {
  return `ARS ${formatNumber(value)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://glitchprice.vercel.app").replace(/\/+$/, "");
}

function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:franappignanesi@gmail.com" };
}

function signVapidJwt(audience: string, subject: string, privateKey: string): string {
  const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64Url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }));
  const key = createPrivateKey({ key: privateKeyToJwk(privateKey), format: "jwk" });
  const signature = createSign("SHA256").update(`${header}.${payload}`).end().sign({ key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${base64Url(signature)}`;
}

function privateKeyToJwk(privateKey: string): JsonWebKey {
  const privateBytes = base64UrlToBuffer(privateKey);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const publicBytes = base64UrlToBuffer(publicKey);
  const point = publicBytes[0] === 4 ? publicBytes.subarray(1) : publicBytes;
  return {
    kty: "EC",
    crv: "P-256",
    d: base64Url(privateBytes),
    x: base64Url(point.subarray(0, 32)),
    y: base64Url(point.subarray(32, 64))
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
