import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { getWishlist, removeWishlistItem, updateWishlistItem, upsertWishlistItem } from "@/lib/user-store";

export async function GET(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  return NextResponse.json({ wishlist: await getWishlist(session.sub) });
}

export async function POST(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const body = await request.json().catch(() => null);
  const item = body?.item;
  if (!item?.gameId || !item?.title) {
    return NextResponse.json({ error: "Missing wishlist item" }, { status: 400 });
  }
  const wishlist = await upsertWishlistItem(session.sub, {
    gameId: item.gameId,
    title: item.title,
    coverUrl: item.coverUrl ?? null,
    category: item.category ?? "sin categoría",
    releaseYear: Number(item.releaseYear) || new Date().getFullYear()
  });
  return NextResponse.json({ wishlist });
}

export async function PATCH(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body?.gameId) {
    return NextResponse.json({ error: "Missing wishlist update" }, { status: 400 });
  }
  const wishlist = await updateWishlistItem(session.sub, body.gameId, {
    notificationEnabled: typeof body.notificationEnabled === "boolean" ? body.notificationEnabled : undefined,
    notificationPreferences: body.notificationPreferences
  });
  return NextResponse.json({ wishlist });
}

export async function DELETE(request: Request) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  return NextResponse.json({ wishlist: await removeWishlistItem(session.sub, gameId) });
}
