import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { countProblemReportsForUserSince, createProblemReport, type ProblemReportCategory } from "@/lib/report-store";

const CATEGORIES: ProblemReportCategory[] = ["Precios mal cargados", "Funcion rota", "Bug visual", "Otro"];
const COOLDOWN_WINDOW_MS = 2 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SCREENSHOT_CHARS = 750_000;

export async function POST(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "Login required", message: "Inicia sesion para reportar problemas." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const category = CATEGORIES.includes(body?.category) ? body.category : "Otro";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 4000) : "";
  if (!description) return NextResponse.json({ error: "Missing description" }, { status: 400 });
  const screenshot = normalizeScreenshot(body?.screenshot);

  const now = Date.now();
  const recentCount = await countProblemReportsForUserSince(session.sub, new Date(now - COOLDOWN_WINDOW_MS).toISOString());
  if (recentCount >= 2) {
    return NextResponse.json({ error: "Cooldown", message: "Espera unos minutos antes de enviar otro reporte." }, { status: 429 });
  }
  const dailyCount = await countProblemReportsForUserSince(session.sub, new Date(now - DAILY_WINDOW_MS).toISOString());
  if (dailyCount >= 5) {
    return NextResponse.json({ error: "Daily limit", message: "Llegaste al limite de 5 reportes por dia." }, { status: 429 });
  }

  const report = await createProblemReport({
    category,
    description,
    screenshot,
    pageUrl: typeof body?.pageUrl === "string" ? body.pageUrl.slice(0, 2000) : "",
    userAgent: typeof body?.userAgent === "string" ? body.userAgent.slice(0, 1000) : "",
    viewport: typeof body?.viewport === "string" ? body.viewport.slice(0, 80) : "",
    userSub: session.sub,
    userEmail: session.email.slice(0, 191),
    userName: session.name.slice(0, 191)
  });

  return NextResponse.json({ ok: true, report: { id: report.id, numericId: report.numericId, createdAt: report.createdAt } });
}

function normalizeScreenshot(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  if (value.length > MAX_SCREENSHOT_CHARS) return null;
  return value;
}
