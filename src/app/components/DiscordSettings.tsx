"use client";

import { useEffect, useState } from "react";
import { Link2, Unlink, Send, ExternalLink } from "lucide-react";

type Status = { available: boolean; connected: boolean; username?: string; verified: boolean };
export function DiscordSettings({ userId, enabled, onChange, admin = false }: { userId: string; enabled: boolean; onChange: (enabled: boolean) => void; admin?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [control, setControl] = useState<{ enabled: boolean; configuredToSend: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    fetch("/api/user/discord", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Discord no está disponible por el momento.");
      setStatus(await response.json());
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error.message); });
    if (new URLSearchParams(window.location.search).get("discord") === "error") setMessage("No pudimos conectar Discord. Volvé a intentarlo.");
    if (admin) fetch("/api/admin/discord", { signal: controller.signal }).then(async (response) => { if (response.ok) setControl(await response.json()); }).catch(() => {});
    return () => controller.abort();
  }, [userId, admin]);
  async function action(kind: "connect" | "test" | "disconnect" | "toggle" | "control", value = false) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const path = kind === "control" ? "/api/admin/discord" : kind === "toggle" ? "/api/user/notification-settings" : kind === "disconnect" ? "/api/user/discord" : `/api/user/discord/${kind}`;
      const response = await fetch(path, { method: kind === "disconnect" ? "DELETE" : kind === "toggle" || kind === "control" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" }, ...(kind === "toggle" ? { body: JSON.stringify({ settings: { discord: value } }) } : kind === "control" ? { body: JSON.stringify({ enabled: value }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos completar la operación. Probá más tarde.");
      if (kind === "connect") { window.location.assign(data.url); return; }
      if (kind === "disconnect") { setStatus((current) => current ? { ...current, connected: false, verified: false, username: undefined } : current); onChange(false); }
      if (kind === "test") { setStatus((current) => current ? { ...current, verified: true } : current); setMessage("Mensaje confirmado. Ya podés activar las alertas."); }
      if (kind === "toggle") { onChange(data.settings.discord); setMessage("Preferencia guardada."); }
      if (kind === "control") { setControl((current) => current ? { ...current, enabled: data.enabled } : current); setMessage(data.enabled ? "Interruptor global habilitado." : "Envíos pausados para todos los usuarios."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Discord no está disponible."); }
    finally { setBusy(false); }
  }
  return <div className="discordSettings" aria-busy={busy}>
    <div><strong>Notificaciones por Discord</strong><p className="settingsHelp">{status?.connected ? `Cuenta conectada: ${status.username}` : "Conectá tu cuenta para recibir por MD las alertas de tu lista de deseados."}</p></div>
    <p className="settingsHelp">Para recibir alertas por MD, tenés que estar en el servidor de SHUX y permitir mensajes directos de sus miembros. Conectar tu cuenta no cambia tus permisos de Discord.</p>
    <div className="discordSettingsActions">
      <a href="https://discord.gg/NF88UabRc" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Unirme al Discord de SHUX</a>
      {!status?.connected ? <button type="button" disabled={busy || !status?.available} onClick={() => action("connect")}><Link2 size={16} />Conectar Discord</button> : <>
        {!status.verified ? <button type="button" disabled={busy} onClick={() => action("test")}><Send size={16} />Enviar prueba</button> : null}
        <button type="button" disabled={busy} onClick={() => action("disconnect")}><Unlink size={16} />Desconectar</button>
      </>}
    </div>
    {status?.connected && !status.verified ? <p className="settingsHelp">Las alertas se pueden activar cuando el mensaje de prueba haya sido confirmado.</p> : null}
    <label className="discordOptIn"><input type="checkbox" checked={enabled} disabled={busy || !status?.verified} onChange={(event) => action("toggle", event.target.checked)} />Quiero recibir alertas por mensaje privado</label>
    {status && !status.available ? <p className="settingsHelp">Estamos preparando la conexión con Discord.</p> : null}
    {message ? <p className="settingsHelp" role="status">{message}</p> : null}
    {admin && control ? <div className="discordAdminControl"><label className="discordOptIn"><input type="checkbox" checked={control.enabled} disabled={busy} onChange={(event) => action("control", event.target.checked)} />Permitir envíos de Discord (global)</label>{!control.configuredToSend ? <p className="settingsHelp">Los envíos siguen apagados en la configuración del servicio.</p> : null}</div> : null}
  </div>;
}
