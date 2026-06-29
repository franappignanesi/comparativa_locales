import { NextResponse } from "next/server";
import { getGoogleClientId } from "@/lib/google-auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const clientId = getGoogleClientId();
  return NextResponse.json(
    { clientId },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
