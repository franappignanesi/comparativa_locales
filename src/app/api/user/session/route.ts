import { NextResponse } from "next/server";
import { clearSessionCookie, setSessionCookie, verifyGoogleCredential } from "@/lib/auth-session";
import { upsertUser } from "@/lib/user-store";

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
  const storedUser = await upsertUser({
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture
  });
  const response = NextResponse.json({ user: storedUser });
  setSessionCookie(response, storedUser);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
