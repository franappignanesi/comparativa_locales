import { NextResponse } from "next/server";
import { getGameSample } from "@/lib/sample-builder";

export async function GET() {
  const sample = await getGameSample();
  return NextResponse.json(sample);
}
