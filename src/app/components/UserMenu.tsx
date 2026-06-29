"use client";

import { LogOut, MessageSquareText, Settings, UserCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type GoogleUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

export type WishlistGame = {
  gameId: string;
  title: string;
  coverUrl?: string | null;
  category: string;
  releaseYear: number;
  addedAt?: string;
  notificationEnabled?: boolean;
  notificationPreferences?: {
    priceDrop: boolean;
    historicalLow: boolean;
    belowUsd: boolean;
    belowUsdValue: number | null;
  };
};

type GoogleCredentialResponse = {
  credential?: string;
};

type ReportFeedbackNotification = {
  id: string;
  numericId: number;
  category: string;
  message: string | null;
  sentAt: string | null;
  resolvedAt: string | null;
};

const REPORT_FEEDBACK_TTL_MS = 24 * 60 * 60 * 1000;
const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_UNAVAILABLE_MESSAGE = "Estamos reconectando los servicios de Google. Aguardá unos minutos o contactanos por Discord o Instagram.";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | boolean | number>) => void;
        };
      };
    };
  }
}

export function UserMenu({
  user,
  onUserChange,
  onSignOut
}: {
  user: GoogleUser | null;
  onUserChange: (user: GoogleUser) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [googleConfigLoading, setGoogleConfigLoading] = useState(false);
  const [reportNotifications, setReportNotifications] = useState<ReportFeedbackNotification[]>([]);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const openMenu = () => setOpen(true);
    const closeMenu = () => {
      setOpen(false);
      setConfirmingSignOut(false);
    };
    window.addEventListener("glitchprice-open-user-menu", openMenu);
    window.addEventListener("glitchprice-close-user-menu", closeMenu);
    return () => {
      window.removeEventListener("glitchprice-open-user-menu", openMenu);
      window.removeEventListener("glitchprice-close-user-menu", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (user || !open) return;

    let active = true;
    setGoogleConfigLoading(true);
    setLoginError(null);
    fetch("/api/auth/google-config", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { clientId?: string } | null;
        if (!response.ok || !payload?.clientId) throw new Error("Google config unavailable");
        if (active) setClientId(payload.clientId);
      })
      .catch(() => {
        if (!active) return;
        setClientId(null);
        setLoginError(GOOGLE_UNAVAILABLE_MESSAGE);
      })
      .finally(() => {
        if (active) setGoogleConfigLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, user]);

  useEffect(() => {
    if (user || !clientId || !open) return;

    const renderButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setLoginError(null);
          const nextUser = decodeGoogleCredential(response.credential);
          if (!nextUser) {
            setLoginError("No pudimos leer la respuesta de Google. Probá otra vez.");
            return;
          }

          const session = await createServerSession(response.credential);
          if (session.ok) {
            onUserChange(session.user ?? nextUser);
            setOpen(false);
            return;
          }
          setLoginError(session.message);
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: 240
      });
    };

    if (window.google?.accounts?.id) {
      renderButton();
      return;
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    const handleScriptError = () => {
      script?.remove();
      setLoginError(GOOGLE_UNAVAILABLE_MESSAGE);
    };
    let shouldAppend = false;
    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      shouldAppend = true;
    }
    script.addEventListener("load", renderButton, { once: true });
    script.addEventListener("error", handleScriptError, { once: true });
    if (shouldAppend) document.head.appendChild(script);

    return () => {
      script?.removeEventListener("load", renderButton);
      script?.removeEventListener("error", handleScriptError);
    };
  }, [clientId, onUserChange, open, user]);

  useEffect(() => {
    if (!open || !user) {
      setReportNotifications([]);
      return;
    }
    fetch("/api/user/report-feedback")
      .then((response) => (response.ok ? response.json() : { notifications: [] }))
      .then((payload: { notifications?: ReportFeedbackNotification[] }) => setReportNotifications(filterVisibleReportFeedback(user.sub, payload.notifications ?? [])))
      .catch(() => setReportNotifications([]));
  }, [open, user]);

  return (
    <div className="userMenu">
      <button className="userButton" type="button" aria-label="Usuario" onClick={() => setOpen((value) => !value)}>
        {user?.picture ? <img src={user.picture} alt="" /> : <UserCircle size={23} />}
      </button>

      {open ? (
        <div className="userDropdown">
          {user ? (
            <>
              <div className="userProfile">
                {user.picture ? <img src={user.picture} alt="" /> : <UserCircle size={34} />}
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              </div>
              <Link className="profileMenuItem" href="/perfil" onClick={() => setOpen(false)}>
                <Settings size={15} />
                <span>
                  Ajustes del perfil
                  <small>Notificaciones y cuenta</small>
                </span>
              </Link>
              {reportNotifications.length ? (
                <div className="reportUserNotifications">
                  <strong>
                    <MessageSquareText size={14} />
                    Devoluciones
                  </strong>
                  {reportNotifications.map((notification) => (
                    <article key={notification.id}>
                      <span>Reporte #{notification.numericId}</span>
                      <p>
                        Gracias por tu reporte. Un moderador lo resolvio: <em>{notification.message}</em>
                      </p>
                      <small>{new Date(notification.sentAt ?? notification.resolvedAt ?? Date.now()).toLocaleString("es-AR")}</small>
                    </article>
                  ))}
                </div>
              ) : null}
              {confirmingSignOut ? (
                <div className="signOutConfirm">
                  <span>¿Cerrar sesión?</span>
                  <div>
                    <button type="button" onClick={() => setConfirmingSignOut(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/user/session", { method: "DELETE" }).catch(() => undefined);
                        onSignOut();
                        setOpen(false);
                        setConfirmingSignOut(false);
                      }}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              ) : (
                <button className="signOutButton" type="button" onClick={() => setConfirmingSignOut(true)}>
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              )}
            </>
          ) : (
            <div className="loginPanel">
              <strong>Iniciar sesión</strong>
              <p>Entrá con Google para guardar tu lista de deseados.</p>
              {clientId ? (
                <>
                  <div ref={googleButtonRef} className="googleButtonSlot" />
                  {loginError ? <span className="loginError">{loginError}</span> : null}
                </>
              ) : googleConfigLoading ? (
                <span>Conectando con Google...</span>
              ) : (
                <span className="loginError">{loginError ?? GOOGLE_UNAVAILABLE_MESSAGE}</span>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function createServerSession(credential: string | undefined): Promise<{ ok: boolean; user?: GoogleUser; message: string }> {
  if (!credential) return { ok: false, message: "Google no devolvió credencial. Probá otra vez." };
  const response = await fetch("/api/user/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ credential })
  }).catch(() => null);
  if (!response) return { ok: false, message: "No pudimos conectar con el servidor. Probá otra vez." };
  const payload = (await response.json().catch(() => null)) as { user?: GoogleUser; error?: string } | null;
  if (response.ok) return { ok: true, user: payload?.user, message: "" };
  return { ok: false, message: payload?.error === "Invalid credential" ? "Google rechazó la credencial. Probá otra vez." : "No pudimos iniciar sesión. Probá otra vez." };
}

function filterVisibleReportFeedback(userId: string, notifications: ReportFeedbackNotification[]): ReportFeedbackNotification[] {
  const now = Date.now();
  return notifications.filter((notification) => {
    const key = `glitchprice-report-feedback-seen:${userId}:${notification.id}`;
    const seenAt = Number(window.localStorage.getItem(key) ?? 0);
    if (!seenAt) {
      window.localStorage.setItem(key, String(now));
      return true;
    }
    return now - seenAt < REPORT_FEEDBACK_TTL_MS;
  });
}

function decodeGoogleCredential(credential: string | undefined): GoogleUser | null {
  if (!credential) return null;
  try {
    const payload = credential.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    const data = JSON.parse(json) as Partial<GoogleUser>;
    if (!data.sub || !data.email || !data.name) return null;
    return {
      sub: data.sub,
      email: data.email,
      name: data.name,
      picture: data.picture
    };
  } catch {
    return null;
  }
}
