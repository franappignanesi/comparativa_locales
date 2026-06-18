import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { DEFAULT_REGION, REGIONS, type RegionId } from "@/lib/regions";
import { getWishlistAlertsForUser } from "@/lib/wishlist-alerts";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const url = new URL(request.url);
  const regionParam = url.searchParams.get("region");
  const region = REGIONS.some((item) => item.id === regionParam) ? (regionParam as RegionId) : DEFAULT_REGION;
  return NextResponse.json({ alerts: await getWishlistAlertsForUser(session.sub, region) });
}
