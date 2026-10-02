"use client";
import { AutumnNavLink } from "@/app/components/AutumnNavLink";

import { BarChart3, Bell, BellOff, ChevronDown, Gamepad2, History, Library, ShieldAlert, X, Save, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { ReleaseBadge } from "@/app/components/ReleaseBadge";
import { useEffect, useState } from "react";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu, WishlistGame } from "@/app/components/UserMenu";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import { AutumnLeafBudget } from "@/app/components/AutumnLeafBudget";
import { deleteWishlistItem, fetchWishlist, fetchWishlistAlerts, persistSession, readStoredUser, updateWishlistItem, type WishlistAlert } from "@/app/components/userPersistence";
import { formatGameCategory } from "@/lib/categories";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { isAdminEmail } from "@/lib/admin";
import { parseWishlistThreshold } from "@/lib/wishlist-threshold";

type BellMenuState = {
  game: WishlistGame;
  x: number;
  y: number;
} | null;

const DEFAULT_PREFERENCES = {
  priceDrop: true,
  historicalLow: false,
  belowUsd: false,
  belowUsdValue: null
};

export default function WishlistPage() {
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [wishlistAlerts, setWishlistAlerts] = useState<WishlistAlert[]>([]);
  const [bellMenu, setBellMenu] = useState<BellMenuState>(null);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("glitchprice-region") as RegionId | null;
    if (saved) setRegion(saved);
    const savedUser = readStoredUser();
    if (savedUser) setUser(savedUser);
  }, []);

  useEffect(() => {
    if (!user) {
      setWishlist([]);
      setWishlistAlerts([]);
      return;
    }
    fetchWishlist(user.sub).then(setWishlist);
    fetchWishlistAlerts(user.sub, region).then(setWishlistAlerts);
  }, [user, region]);

  async function handleUserChange(nextUser: GoogleUser) {
    setUser(nextUser);
    await persistSession(nextUser);
    setWishlist(await fetchWishlist(nextUser.sub));
    setWishlistAlerts(await fetchWishlistAlerts(nextUser.sub, region));
  }

  function handleSignOut() {
    setUser(null);
    setWishlist([]);
    setWishlistAlerts([]);
    window.localStorage.removeItem("glitchprice-user");
  }

  async function toggleBell(game: WishlistGame) {
    if (!user) return;
    const nextWishlist = await updateWishlistItem(user.sub, game.gameId, {
      notificationEnabled: !(game.notificationEnabled ?? true)
    });
    setWishlist(nextWishlist);
    setWishlistAlerts(await fetchWishlistAlerts(user.sub, region));
  }

  async function removeGame(gameId: string) {
    if (!user) return;
    setWishlist(await deleteWishlistItem(user.sub, gameId));
    setWishlistAlerts(await fetchWishlistAlerts(user.sub, region));
  }

  async function updatePreferences(game: WishlistGame, updates: Partial<NonNullable<WishlistGame["notificationPreferences"]>>) {
    if (!user) throw new Error("Iniciá sesión nuevamente para guardar las preferencias.");
    const current = game.notificationPreferences ?? DEFAULT_PREFERENCES;
    const nextWishlist = await updateWishlistItem(user.sub, game.gameId, {
      notificationPreferences: { ...current, ...updates }
    }, { requireRemote: true });
    setWishlist(nextWishlist);
    void fetchWishlistAlerts(user.sub, region).then(setWishlistAlerts).catch(() => undefined);
    const nextGame = nextWishlist.find((item) => item.gameId === game.gameId);
    if (nextGame) setBellMenu((currentMenu) => (currentMenu?.game.gameId === game.gameId ? { ...currentMenu, game: nextGame } : currentMenu));
  }

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <Link className="brand" href="/">BARATEAM</Link>
          <ReleaseBadge />
        </div>
        <div className="navTools">
          <AutumnLeafBudget userSub={user?.sub} />
          <ProblemReportButton user={user} />
          <Link className="wishlistNavButton active" href="/wishlist">
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
          <h2>Mi lista</h2>
          <p>Juegos deseados</p>
        </div>
        <div className="sideLinks">
          <Link href="/" className="sideLink">
            <History size={20} />
            Inicio
          </Link>
          <div className={`sideGroup ${libraryMenuOpen ? "open" : ""}`}>
            <button className="sideLink sideGroupToggle" type="button" onClick={() => setLibraryMenuOpen((current) => !current)} aria-expanded={libraryMenuOpen}>
              <span>
                <Library size={20} />
                Biblioteca
              </span>
              <ChevronDown size={17} />
            </button>
            <div className="sideSubLinks">
              <Link href="/biblioteca" className="sideSubLink">Todo el catálogo</Link>
              <Link href="/biblioteca?filter=ofertas&sort=descuento" className="sideSubLink">Ofertas 🎁</Link>
              <Link href="/biblioteca?filter=diferencias&sort=diferencia" className="sideSubLink">Más baratos que Steam 👀</Link>
              <Link href="/biblioteca?filter=historicos" className="sideSubLink">Mínimos históricos 📉</Link>
            </div>
          </div>
          <AutumnNavLink />
          <Link href="/comparativa-general" className="sideLink">
            <BarChart3 size={20} />
            Comparativa general
          </Link>
          {isAdminEmail(user?.email) ? (
            <Link href="/admin/reportes" className="sideLink adminSideLink">
              <ShieldAlert size={20} />
              Reportes
            </Link>
          ) : null}
        </div>
      </aside>

      <main className="page wishlistPage" onClick={() => setBellMenu(null)}>
        <header className="heroHeader">
          <div>
            <h1>Mi lista</h1>
          </div>
        </header>

        <section className="wishlistIntro">
          <p>
            Lista de juegos deseados. Se te va a notificar cuando bajen de precio siempre y cuando tengan la campanita activada (con click
            derecho podés establecer preferencias específicas).{" "}
            <Link href="/perfil#notificaciones">Configurar notificaciones</Link>
          </p>
        </section>

        {!user ? (
          <section className="wishlistEmptyPage">
            <p>Iniciá sesión con Google para guardar juegos y sincronizar tu lista.</p>
            <button className="button primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"))}>
              Iniciar sesión
            </button>
          </section>
        ) : wishlist.length ? (
          <section className="wishlistListPage" aria-label="Juegos deseados">
            {sortWishlistByAlerts(wishlist, wishlistAlerts).map((game) => {
              const enabled = game.notificationEnabled ?? true;
              const BellIcon = enabled ? Bell : BellOff;
              const alert = wishlistAlerts.find((item) => item.gameId === game.gameId);
              return (
                <article className={alert ? "wishlistRow alert" : "wishlistRow"} key={game.gameId}>
                  <Link href={`/biblioteca?query=${encodeURIComponent(game.title)}&game=${encodeURIComponent(game.gameId)}`}>
                    {game.coverUrl ? <img src={game.coverUrl} alt="" /> : <span className="wishlistCoverFallback" />}
                    <div>
                      <strong>{game.title}</strong>
                      <small>
                        {game.releaseYear} · {formatGameCategory(game.category)} · Agregado {formatDate(game.addedAt)}
                      </small>
                    </div>
                  </Link>
                  <button
                    className={enabled ? "wishlistBell active" : "wishlistBell"}
                    type="button"
                    aria-label={enabled ? "Desactivar notificaciones" : "Activar notificaciones"}
                    onClick={() => toggleBell(game)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setBellMenu({ game, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <BellIcon size={18} />
                  </button>
                  {alert ? <div className="wishlistAlertReason">{alert.message}</div> : null}
                  <button className="wishlistRemove" type="button" aria-label={`Quitar ${game.title}`} onClick={() => removeGame(game.gameId)}>
                    <X size={17} />
                  </button>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="wishlistEmptyPage">
            <p>Todavía no guardaste juegos. Entrá a la biblioteca y marcá favoritos con la estrella.</p>
            <Link className="button primary" href="/biblioteca">
              Explorar juegos
            </Link>
          </section>
        )}

        {bellMenu ? <BellPreferencesMenu key={bellMenu.game.gameId} menu={bellMenu} onUpdate={updatePreferences} onClose={() => setBellMenu(current => current?.game.gameId === bellMenu.game.gameId ? null : current)} /> : null}
      </main>
    </div>
  );
}

function BellPreferencesMenu({
  menu,
  onUpdate,
  onClose
}: {
  menu: NonNullable<BellMenuState>;
  onUpdate: (game: WishlistGame, updates: Partial<NonNullable<WishlistGame["notificationPreferences"]>>) => Promise<void>;
  onClose: () => void;
}) {
  const [preferences, setPreferences] = useState(menu.game.notificationPreferences ?? DEFAULT_PREFERENCES);
  const [threshold, setThreshold] = useState(String(preferences.belowUsdValue ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const price = parseWishlistThreshold(threshold);
    if (preferences.belowUsd && price == null) {
      setError("Ingresá un precio mayor que cero, con hasta dos decimales.");
      return;
    }
    setSaving(true); setError("");
    try {
      await onUpdate(menu.game, { ...preferences, belowUsdValue: price });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar las preferencias. Intentá nuevamente.");
    } finally { setSaving(false); }
  }
  return (
    <form
      className="bellPreferencesMenu"
      style={{ left: `clamp(14px, ${menu.x}px, max(14px, calc(100vw - 334px)))`, top: `clamp(14px, ${menu.y}px, max(14px, calc(100dvh - 280px)))` }}
      onClick={(event) => event.stopPropagation()}
      onSubmit={save}
      onKeyDown={event => { if (event.key === "Escape" && !saving) onClose(); }}
      role="dialog"
      aria-label={`Preferencias de ${menu.game.title}`}
    >
      <strong>Preferencias</strong>
      <label>
        <input type="checkbox" disabled={saving} checked={preferences.priceDrop} onChange={(event) => setPreferences(current => ({ ...current, priceDrop: event.target.checked }))} />
        Notificar cuando baje de precio
      </label>
      <label>
        <input
          type="checkbox"
          checked={preferences.historicalLow}
          disabled={saving}
          onChange={(event) => setPreferences(current => ({ ...current, historicalLow: event.target.checked }))}
        />
        Notificar cuando alcance mínimo
      </label>
      <div className="bellThresholdRow">
        <label>
          <input type="checkbox" disabled={saving} checked={preferences.belowUsd} onChange={(event) => setPreferences(current => ({ ...current, belowUsd: event.target.checked }))} />
          Notificar cuando baje de USD
        </label>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Precio máximo en USD para notificar"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "wishlist-preferences-error" : undefined}
          disabled={saving || !preferences.belowUsd}
          value={threshold}
          placeholder="0.00"
          onChange={(event) => { setThreshold(event.target.value); setError(""); }}
        />
      </div>
      {error ? <p id="wishlist-preferences-error" className="bellPreferencesError" role="alert">{error}</p> : null}
      <button type="submit" className="bellPreferencesSave" disabled={saving}>
        {saving ? <LoaderCircle size={14} /> : <Save size={14} />}{saving ? "Guardando..." : "Guardar"}
      </button>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
    </form>
  );
}

function formatDate(value: string | undefined): string {
  if (!value) return "sin fecha";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function sortWishlistByAlerts(wishlist: WishlistGame[], alerts: WishlistAlert[]): WishlistGame[] {
  const alertIndex = new Map(alerts.map((alert, index) => [alert.gameId, index]));
  return [...wishlist].sort((a, b) => {
    const aIndex = alertIndex.get(a.gameId);
    const bIndex = alertIndex.get(b.gameId);
    if (aIndex != null && bIndex != null) return aIndex - bIndex;
    if (aIndex != null) return -1;
    if (bIndex != null) return 1;
    return Date.parse(b.addedAt ?? "") - Date.parse(a.addedAt ?? "");
  });
}
