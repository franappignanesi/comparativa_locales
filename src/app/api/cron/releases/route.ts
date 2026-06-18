import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/env";
import { discoverSteamReleases, promotePendingReleases } from "@/lib/release-automation";
import { recordRefreshRun } from "@/lib/operational-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleReleases(request);
}

export async function GET(request: NextRequest) {
  return handleReleases(request);
}

async function handleReleases(request: NextRequest) {
  const secret = bearerToken(request);
  if (!assertCronSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? "discover";
  const tasks = tasksForMode(mode);
  if (!tasks.length) {
    return NextResponse.json({ ok: false, error: "Invalid mode. Use discover, fast, weekly or all." }, { status: 400 });
  }

  const results = [];
  for (const task of tasks) {
    try {
      results.push({ task: task.name, ok: true, result: await task.run() });
    } catch (error) {
      results.push({
        task: task.name,
        ok: false,
        error: error instanceof Error ? error.message : "Release automation failed"
      });
      break;
    }
  }

  const ok = results.every((result) => result.ok);
  const status = ok ? 200 : 207;
  const response = { ok, timestamp: new Date().toISOString(), mode, results };
  await recordRefreshRun({ name: "release-automation", ok, statusCode: status, summary: response });
  return NextResponse.json(response, { status });
}

function tasksForMode(mode: string): Array<{ name: string; run: () => Promise<unknown> }> {
  if (mode === "discover") return [{ name: "discover", run: discoverSteamReleases }];
  if (mode === "fast") return [{ name: "promote-fast", run: () => promotePendingReleases("fast") }];
  if (mode === "weekly") return [{ name: "promote-weekly", run: () => promotePendingReleases("weekly") }];
  if (mode === "all") {
    return [
      { name: "discover", run: discoverSteamReleases },
      { name: "promote-fast", run: () => promotePendingReleases("fast") }
    ];
  }
  return [];
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
