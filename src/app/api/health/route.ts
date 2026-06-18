import { NextResponse } from "next/server";
import { getEnvStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnvStatus();
  return NextResponse.json(
    {
      ok: env.ok,
      timestamp: new Date().toISOString(),
      env
    },
    { status: env.ok ? 200 : 503 }
  );
}
