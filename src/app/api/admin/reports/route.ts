import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { listProblemReports, updateProblemReportStatus } from "@/lib/report-store";

export async function GET(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json({ reports: await listProblemReports() });
}

export async function PATCH(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = (await request.json()) as { email?: string; id?: string; resolved?: boolean; feedbackMessage?: string | null };
  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "Missing report id" }, { status: 400 });
  }
  const nextResolved = body.resolved === true;
  const feedbackMessage = typeof body.feedbackMessage === "string" ? body.feedbackMessage.trim().slice(0, 2000) : null;
  const report = await updateProblemReportStatus(id, session.email, nextResolved, feedbackMessage);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  return NextResponse.json({
    report: {
      ...report,
      resolved: nextResolved,
      resolvedAt: nextResolved ? report.resolvedAt ?? new Date().toISOString() : null,
      resolvedBy: nextResolved ? report.resolvedBy ?? session.email : null
    }
  });
}
