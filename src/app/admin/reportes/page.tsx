"use client";

import { BarChart3, Bell, CheckCircle2, ChevronDown, Circle, ExternalLink, History, Library, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu } from "@/app/components/UserMenu";
import { fetchWishlistAlerts, persistSession, readStoredUser, type WishlistAlert } from "@/app/components/userPersistence";
import { isAdminEmail } from "@/lib/admin";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import type { ProblemReport } from "@/lib/report-store";

type ResolveDraft = {
  reportId: string;
  notify: boolean | null;
  message: string;
};

export default function AdminReportsPage() {
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [alerts, setAlerts] = useState<WishlistAlert[]>([]);
  const [reports, setReports] = useState<ProblemReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [resolveDraft, setResolveDraft] = useState<ResolveDraft>({ reportId: "", notify: null, message: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedRegion = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (savedRegion) setRegion(savedRegion);
    const savedUser = readStoredUser();
    if (savedUser) setUser(savedUser);
  }, []);

  useEffect(() => {
    if (!user) {
      setAlerts([]);
      setReports([]);
      setLoading(false);
      return;
    }
    fetchWishlistAlerts(user.sub, region).then(setAlerts);
    if (!isAdminEmail(user.email)) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/admin/reports?email=${encodeURIComponent(user.email)}`)
      .then((response) => response.json())
      .then((payload) => setReports(payload.reports ?? []))
      .finally(() => setLoading(false));
  }, [user, region]);

  const sortedReports = useMemo(
    () =>
      [...reports].sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }),
    [reports]
  );

  async function handleUserChange(nextUser: GoogleUser) {
    setUser(nextUser);
    await persistSession(nextUser);
  }

  function handleSignOut() {
    setUser(null);
    setAlerts([]);
    window.localStorage.removeItem("glitchprice-user");
  }

  async function saveResolved(report: ProblemReport, resolved: boolean, feedbackMessage: string | null = null) {
    if (!user || updatingReportId) return;
    setUpdatingReportId(report.id);
    try {
      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, id: report.id, resolved, feedbackMessage })
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { report?: ProblemReport };
      const responseReport = payload.report;
      const fallbackReport: ProblemReport = {
        ...report,
        resolved,
        resolvedAt: resolved ? new Date().toISOString() : null,
        resolvedBy: resolved ? user.email : null,
        feedbackMessage: resolved && feedbackMessage ? feedbackMessage : null,
        feedbackSentAt: resolved && feedbackMessage ? new Date().toISOString() : null,
        feedbackBy: resolved && feedbackMessage ? user.email : null
      };
      const nextReport: ProblemReport = {
        ...fallbackReport,
        ...responseReport,
        resolved,
        resolvedAt: resolved ? responseReport?.resolvedAt ?? fallbackReport.resolvedAt : null,
        resolvedBy: resolved ? responseReport?.resolvedBy ?? fallbackReport.resolvedBy : null,
        feedbackMessage: resolved && feedbackMessage ? responseReport?.feedbackMessage ?? feedbackMessage : null,
        feedbackSentAt: resolved && feedbackMessage ? responseReport?.feedbackSentAt ?? fallbackReport.feedbackSentAt : null,
        feedbackBy: resolved && feedbackMessage ? responseReport?.feedbackBy ?? fallbackReport.feedbackBy : null
      };
      setReports((current) => current.map((item) => (item.id === report.id ? nextReport : item)));
      setResolveDraft({ reportId: "", notify: null, message: "" });
    } finally {
      setUpdatingReportId(null);
    }
  }

  const isAdmin = isAdminEmail(user?.email);

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <div className="brand">BARATEAM</div>
          <span className="betaBadge">BETA</span>
        </div>
        <div className="navTools">
          <ProblemReportButton user={user} />
          <Link className="wishlistNavButton" href="/wishlist">
            <Bell size={15} />
            Mi lista
            {alerts.length ? <span className="alert">{alerts.length}</span> : null}
          </Link>
          <RegionSelector value={region} onChange={setRegion} />
          <UserMenu user={user} onUserChange={handleUserChange} onSignOut={handleSignOut} />
        </div>
      </nav>

      <aside className="sideNav">
        <div className="sideHeader">
          <h2>Admin</h2>
          <p>Reportes de usuarios</p>
        </div>
        <div className="sideLinks">
          <Link href="/" className="sideLink">
            <History size={20} />
            Inicio
          </Link>
          <Link href="/biblioteca" className="sideLink">
            <Library size={20} />
            Biblioteca
          </Link>
          <Link href="/comparativa-general" className="sideLink">
            <BarChart3 size={20} />
            Comparativa general
          </Link>
          {isAdmin ? (
            <Link href="/admin/reportes" className="sideLink adminSideLink active">
              <ShieldAlert size={20} />
              Reportes
            </Link>
          ) : null}
        </div>
      </aside>

      <main className="page adminReportsPage">
        <header className="heroHeader">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Reportes de problema</h1>
          </div>
        </header>

        {!user ? (
          <section className="adminNotice">
            <p>Inicia sesion con una cuenta administradora para ver reportes.</p>
            <button className="button primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"))}>
              Iniciar sesion
            </button>
          </section>
        ) : !isAdmin ? (
          <section className="adminNotice">
            <p>Esta seccion solo esta disponible para cuentas administradoras.</p>
          </section>
        ) : loading ? (
          <p className="loading">Cargando reportes...</p>
        ) : sortedReports.length ? (
          <section className="reportsList">
            {sortedReports.map((report) => {
              const expanded = expandedReportId === report.id;
              const resolving = resolveDraft.reportId === report.id;
              const canNotify = Boolean(report.userSub || report.userEmail);
              return (
                <article className={report.resolved ? "reportCard resolved" : "reportCard"} key={report.id}>
                  <div className="reportSummary">
                    <button
                      className="reportExpand"
                      type="button"
                      onClick={() => setExpandedReportId(expanded ? null : report.id)}
                      aria-expanded={expanded}
                    >
                      <span className="reportCategory">#{report.numericId} · {report.category === "Funcion rota" ? "Funcion rota" : report.category}</span>
                      <strong>{report.description}</strong>
                      <small>
                        {report.userEmail ?? "Usuario anonimo"} · {new Date(report.createdAt).toLocaleString("es-AR")}
                      </small>
                    </button>
                    <button
                      className={report.resolved ? "reportResolve resolved" : "reportResolve"}
                      type="button"
                      disabled={updatingReportId === report.id}
                      onClick={() => {
                        if (report.resolved) {
                          saveResolved(report, false);
                          return;
                        }
                        setResolveDraft({ reportId: report.id, notify: null, message: "" });
                      }}
                    >
                      {report.resolved ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      {report.resolved ? "Resuelto" : "Marcar resuelto"}
                    </button>
                    <button className="reportChevron" type="button" onClick={() => setExpandedReportId(expanded ? null : report.id)} aria-label="Desplegar reporte">
                      <ChevronDown size={18} className={expanded ? "open" : ""} />
                    </button>
                  </div>

                  {resolving ? (
                    <div className="reportResolvePanel">
                      <strong>Notificar?</strong>
                      <p>
                        {canNotify
                          ? "Si notificas, el usuario va a ver una devolucion en su menu de cuenta."
                          : "Este reporte no tiene usuario asociado. Podes marcarlo como resuelto sin notificar."}
                      </p>
                      {resolveDraft.notify === true ? (
                        <label>
                          Mensaje para el usuario
                          <textarea
                            value={resolveDraft.message}
                            onChange={(event) => setResolveDraft((current) => ({ ...current, message: event.target.value }))}
                            placeholder="Ej: Corregimos el precio y ya deberia verse actualizado."
                            rows={3}
                          />
                        </label>
                      ) : null}
                      <div>
                        <button type="button" onClick={() => setResolveDraft({ reportId: "", notify: null, message: "" })}>
                          Cancelar
                        </button>
                        <button type="button" disabled={updatingReportId === report.id} onClick={() => saveResolved(report, true, null)}>
                          No notificar
                        </button>
                        {resolveDraft.notify === true ? (
                          <button
                            type="button"
                            disabled={!resolveDraft.message.trim() || updatingReportId === report.id || !canNotify}
                            onClick={() => saveResolved(report, true, resolveDraft.message)}
                          >
                            Enviar devolucion
                          </button>
                        ) : (
                          <button type="button" disabled={!canNotify} onClick={() => setResolveDraft((current) => ({ ...current, notify: true }))}>
                            Notificar
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {expanded ? (
                    <div className="reportDetails">
                      <div className="reportMeta">
                        <a href={report.pageUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} />
                          Abrir pagina reportada
                        </a>
                        <small>
                          Viewport {report.viewport}
                          {report.resolvedAt ? ` · Resuelto ${new Date(report.resolvedAt).toLocaleString("es-AR")}` : ""}
                          {report.feedbackSentAt ? ` · Devolucion enviada ${new Date(report.feedbackSentAt).toLocaleString("es-AR")}` : ""}
                        </small>
                      </div>
                      {report.feedbackMessage ? <p className="reportFeedbackPreview">Devolucion: {report.feedbackMessage}</p> : null}
                      {report.screenshot ? <img src={report.screenshot} alt="Captura adjunta del reporte" /> : <em>Sin captura adjunta</em>}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <section className="adminNotice">
            <p>Todavia no hay reportes.</p>
          </section>
        )}
      </main>
    </div>
  );
}
