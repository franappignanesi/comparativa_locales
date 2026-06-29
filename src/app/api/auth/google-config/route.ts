import { NextResponse } from "next/server";
import { getGoogleClientId } from "@/lib/google-auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const clientId = getGoogleClientId();
  if (!clientId) {
    console.error("[auth] Google client configuration unavailable at runtime");
    return NextResponse.json(
      { error: "Google login is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { clientId },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
