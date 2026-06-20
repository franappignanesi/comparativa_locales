import { createPrivateKey, createSign } from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import { listPushSubscriptionsForUser, type StoredPushSubscription } from "./push-subscription-store";
import type { StoredUser } from "./user-store";
import type { WishlistAlert } from "./wishlist-alerts";

export async function sendEmailAlerts(user: StoredUser, alerts: WishlistAlert[]): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !user.email || !alerts.length) return 0;
  const from = process.env.EMAIL_FROM || "GLITCHPRICE <onboarding@resend.dev>";
  const subject = alerts.length === 1 ? `Alerta de precio: ${alerts[0].gameTitle}` : `Tenés ${alerts.length} alertas de precio en GLITCHPRICE`;
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
        <li style="margin:0 0 14px 0">
          <strong>${escapeHtml(alert.gameTitle)}</strong><br />
          <span>${escapeHtml(alert.message)}</span><br />
          <small>${escapeHtml(alert.store.toUpperCase())} · ${escapeHtml(alert.region)}</small>
        </li>`
    )
    .join("");
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#161616">
      <h1 style="font-size:20px;margin:0 0 12px 0">GLITCHPRICE</h1>
      <p>Hola ${escapeHtml(user.name)}, encontramos novedades en tu wishlist.</p>
      <ul style="padding-left:20px">${items}</ul>
      <p><a href="https://glitchprice.vercel.app/wishlist">Ver mi wishlist</a></p>
    </div>`;
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
