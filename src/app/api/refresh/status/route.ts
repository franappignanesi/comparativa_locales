import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { dataPath, readJson } from "@/lib/cache";
import { readOperationalLock } from "@/lib/operational-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [priceStatus, priceCursor, microsoftStatus, microsoftCursor, priceLock, microsoftLock] = await Promise.all([
    readJson(dataPath("generated", "price-refresh-status.json"), null),
    readJson(dataPath("generated", "price-refresh-cursor.json"), null),
    readJson(dataPath("generated", "microsoft-refresh-runner-status.json"), null),
    readJson(dataPath("generated", "microsoft-refresh-cursor.json"), null),
    readOperationalLock("price-refresh").then((lock) => lock ?? readJson(dataPath("generated", "locks", "price-refresh.lock.json"), null)),
    readOperationalLock("microsoft-refresh").then((lock) => lock ?? readJson(dataPath("generated", "locks", "microsoft-refresh.lock.json"), null))
  ]);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    priceRefresh: {
      status: priceStatus,
      cursor: priceCursor,
      lock: priceLock
    },
    microsoftRefresh: {
      status: microsoftStatus,
      cursor: microsoftCursor,
      lock: microsoftLock
    }
  });
}
