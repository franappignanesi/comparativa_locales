import { NextResponse } from "next/server";
import { getPopularWishlistGames } from "@/lib/wishlist-popularity";

export async function GET() {
  try {
    return NextResponse.json({ games: await getPopularWishlistGames() }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=60" }
    });
  } catch (error) {
    console.error("Wishlist popularity unavailable", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ games: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
