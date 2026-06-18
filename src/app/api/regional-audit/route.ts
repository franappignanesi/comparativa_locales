import { NextResponse } from "next/server";
import { dataPath, readJson } from "@/lib/cache";

const emptyAudit = {
  timestamp: null,
  regions: [],
  stores: [],
  criteria: {},
  counts: {
    totalCandidates: 0,
    regionalComparable: 0,
    regionalStrict: 0,
    regionalStoreComparable: {}
  },
  perRegion: {},
  regionalComparable: [],
  regionalStrict: [],
  regionalStoreComparable: {},
  rejected: []
};

export async function GET() {
  const audit = await readJson(dataPath("generated", "regional-audit-sample.json"), emptyAudit);
  return NextResponse.json(audit);
}
