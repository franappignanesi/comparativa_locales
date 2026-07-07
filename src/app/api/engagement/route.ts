import { NextRequest, NextResponse } from "next/server";
import { recordPageEngagement } from "@/lib/engagement-store";

const MAX_BODY_BYTES = 1024;
const MAX_SECONDS = 60 * 60;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let body: { path?: unknown; seconds?: unknown };
  try {
    body = (await request.json()) as { path?: unknown; seconds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const path = normalizePath(body.path);
  const seconds = Math.round(Number(body.seconds));
  if (!path || !Number.isFinite(seconds) || seconds < 3 || seconds > MAX_SECONDS) {
    return NextResponse.json({ error: "Invalid engagement sample" }, { status: 400 });
  }

  await recordPageEngagement(path, seconds);
  return new NextResponse(null, { status: 204 });
}

function isSameOriginRequest(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(requestHost) && new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().split("?")[0].slice(0, 255);
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}
