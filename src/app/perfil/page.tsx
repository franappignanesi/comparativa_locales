"use client";

import { BarChart3, Bell, History, Library, Mail, MonitorSmartphone, Settings, ShieldAlert, Webhook } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu, WishlistGame } from "@/app/components/UserMenu";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchNotificationSettings,
  fetchWishlist,
  fetchWishlistAlerts,
  NotificationSettings,
  persistSession,
  readStoredUser,
  saveNotificationSettings,
  type WishlistAlert
} from "@/app/components/userPersistence";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { isAdminEmail } from "@/lib/admin";
import { STORE_LOGOS } from "@/lib/store-assets";
import type { StoreId } from "@/lib/types";
import { STORES } from "@/lib/types";

const STORE_LABELS: Record<StoreId, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  humble: "Humble",
  microsoft: "Microsoft"
};

export default function ProfilePage() {
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [wishlistAlerts, setWishlistAlerts] = useState<WishlistAlert[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedRegion = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (savedRegion) setRegion(savedRegion);
    const savedUser = readStoredUser();
    if (savedUser) setUser(savedUser);
  }, []);

  useEffect(() => {
    if (!user) {
      setWishlist([]);
      setWishlistAlerts([]);
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
      return;
    }
    fetchWishlist(user.sub).then(setWishlist);
    fetchWishlistAlerts(user.sub, region).then(setWishlistAlerts);
    fetchNotificationSettings(user.sub).then(setSettings);
  }, [user, region]);

  async function handleUserChange(nextUser: GoogleUser) {
    setUser(nextUser);
    await persistSession(nextUser);
    setWishlist(await fetchWishlist(nextUser.sub));
    setWishlistAlerts(await fetchWishlistAlerts(nextUser.sub, region));
    setSettings(await fetchNotificationSettings(nextUser.sub));
  }

  function handleSignOut() {
    setUser(null);
    setWishlist([]);
    setWishlistAlerts([]);
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    window.localStorage.removeItem("glitchprice-user");
  }

  async function updateSetting(key: keyof NotificationSettings, value: boolean) {
    if (!user) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSettings(await saveNotificationSettings(user.sub, next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  async function toggleStore(store: StoreId, enabled: boolean) {
    if (!user) return;
    const currentStores = settings.enabledStores?.length ? settings.enabledStores : [...STORES];
    const nextStores = enabled ? [...new Set([...currentStores, store])] : currentStores.filter((item) => item !== store);
    const next = { ...settings, enabledStores: nextStores.length ? nextStores : [...STORES] };
    setSettings(next);
    setSettings(await saveNotificationSettings(user.sub, next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <div className="brand">GLITCHPRICE</div>
        </div>
        <div className="navTools">
          <ProblemReportButton user={user} />
          <Link className="wishlistNavButton" href="/wishlist">
            <Bell size={15} />
            Mi lista
            {wishlistAlerts.length ? <span className="alert">{wishlistAlerts.length}</span> : null}
          </Link>
          <RegionSelector value={region} onChange={setRegion} />
          <UserMenu user={user} onUserChange={handleUserChange} onSignOut={handleSignOut} />
        </div>
      </nav>

      <aside className="sideNav">
        <div className="sideHeader">
          <h2>Perfil</h2>
          <p>Ajustes de usuario</p>
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
          <Link href="/perfil#notificaciones" className="sideLink active">
            <Settings size={20} />
            Perfil
          </Link>
          {isAdminEmail(user?.email) ? (
            <Link href="/admin/reportes" className="sideLink adminSideLink">
              <ShieldAlert size={20} />
              Reportes
            </Link>
          ) : null}
        </div>
      </aside>

      <main className="page profilePage">
        <header className="heroHeader">
          <div>
            <h1>Ajustes de usuario</h1>
          </div>
        </header>

        {!user ? (
          <section className="profilePanel">
            <h2>Iniciar sesión</h2>
            <p>Entrá con Google para configurar notificaciones y persistir tu wishlist.</p>
            <button className="button primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"))}>
              Iniciar sesión
            </button>
          </section>
        ) : (
          <>
            <section className="profilePanel">
              <h2>Cuenta</h2>
              <div className="profileIdentity">
                {user.picture ? <img src={user.picture} alt="" /> : null}
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              </div>
            </section>

            <section id="notificaciones" className="profilePanel notificationSettings">
              <div className="profilePanelHeader">
                <div>
                  <span>Ajustes de notificaciones</span>
                  <h2>Canales activos</h2>
                </div>
                {saved ? <strong>Guardado</strong> : null}
              </div>
              <NotificationToggle
                icon={<Mail size={18} />}
                title="Notificación por mail"
                description="Usa el email de Google para avisos de bajadas, mínimos históricos y umbrales."
                checked={settings.email}
                onChange={(value) => updateSetting("email", value)}
              />
              <NotificationToggle
                icon={<MonitorSmartphone size={18} />}
                title="Notificación push web"
                description="Prepara permisos del navegador para avisos fuera de la app."
                checked={settings.webPush}
                onChange={(value) => updateSetting("webPush", value)}
              />
              <NotificationToggle
                icon={<Webhook size={18} />}
                title="Notificación por Discord"
                description="Canal pensado para conectar más adelante con usuario, bot o webhook personal."
                checked={settings.discord}
                onChange={(value) => updateSetting("discord", value)}
              />
            </section>

            <section className="profilePanel notificationSettings">
              <div className="profilePanelHeader">
                <div>
                  <span>Plataformas</span>
                  <h2>Tiendas que usás</h2>
                </div>
                {saved ? <strong>Guardado</strong> : null}
              </div>
              <p className="settingsHelp">
                Las tiendas desactivadas no aparecen en las opciones de compra y no disparan notificaciones.
              </p>
              {STORES.map((store) => (
                <NotificationToggle
                  key={store}
                  icon={<img className="storeLogo" src={STORE_LOGOS[store]} alt="" aria-hidden="true" />}
                  title={STORE_LABELS[store]}
                  description="Mostrar precios y recibir avisos de esta tienda."
                  checked={(settings.enabledStores?.length ? settings.enabledStores : STORES).includes(store)}
                  onChange={(value) => toggleStore(store, value)}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function NotificationToggle({
  icon,
  title,
  description,
  checked,
  onChange
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="notificationToggle">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <em aria-hidden="true" />
    </label>
  );
}
