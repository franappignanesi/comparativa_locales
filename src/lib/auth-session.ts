import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export type AuthSession = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
};

type GoogleTokenInfo = {
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;
};

const SESSION_COOKIE = "glitchprice_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const DEV_SESSION_SECRET = "dev-session-secret-for-local-glitchprice-only-please-set-session-secret";

export async function verifyGoogleCredential(credential: string): Promise<Omit<AuthSession, "iat" | "exp"> | null> {
  if (!credential) return null;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) return null;

  const token = (await response.json()) as GoogleTokenInfo;
  if (token.aud !== clientId || !token.sub || !token.email || !token.name) return null;
  if (token.email_verified === false || token.email_verified === "false") return null;
  if (token.exp && Number(token.exp) * 1000 < Date.now()) return null;

  return {
    sub: token.sub.slice(0, 191),
    email: token.email.slice(0, 255),
    name: token.name.slice(0, 255),
    picture: token.picture
  };
}

export function getCurrentUser(request: Request): AuthSession | null {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}

export function requireCurrentUser(request: Request): AuthSession {
  const session = getCurrentUser(request);
  if (!session) throw new AuthRequiredError();
  return session;
}

export function setSessionCookie(response: NextResponse, user: Omit<AuthSession, "iat" | "exp">): void {
  const now = Math.floor(Date.now() / 1000);
  const session: AuthSession = {
    ...user,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  response.cookies.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function signSession(session: AuthSession): string {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): AuthSession | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AuthSession>;
    if (!session.sub || !session.email || !session.name || !session.exp) return null;
    if (session.exp * 1000 < Date.now()) return null;
    return session as AuthSession;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("Missing SESSION_SECRET");
  return DEV_SESSION_SECRET;
}
