import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, setSessionCookie, verifyGoogleCredential } from "@/lib/auth-session";
import { DEFAULT_NOTIFICATION_SETTINGS, upsertUser } from "@/lib/user-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const credential = typeof body?.credential === "string" ? body.credential : "";
  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }
  const user = await verifyGoogleCredential(credential);
  if (!user) {
    return NextResponse.json({ error: "Invalid credential" }, { status: 401 });
  }
  const now = new Date().toISOString();
  let persisted = true;
  let storedUser = {
    ...user,
    createdAt: now,
    updatedAt: now,
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS
  };

  try {
    storedUser = await upsertUser({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture
    });
  } catch (error) {
    persisted = false;
    console.error("[auth] user persistence failed; issuing session cookie anyway", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const response = NextResponse.json({ user: storedUser, persisted });
  setSessionCookie(response, user);
  return response;
}

export async function GET(request: Request) {
  const user = getCurrentUser(request);
  return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
