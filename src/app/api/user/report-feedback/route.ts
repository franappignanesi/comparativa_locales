import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth-session";
import { listProblemReportFeedbackForUser } from "@/lib/report-store";

export async function GET(request: NextRequest) {
  const session = getCurrentUser(request);
  if (!session) return unauthorized();

  const reports = await listProblemReportFeedbackForUser(session.sub, session.email);
  return NextResponse.json({
    notifications: reports.map((report) => ({
      id: report.id,
      numericId: report.numericId,
      category: report.category,
      message: report.feedbackMessage,
      sentAt: report.feedbackSentAt,
      resolvedAt: report.resolvedAt
    }))
  });
}
