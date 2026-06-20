"use client";

import { BarChart3, Bell, BellOff, Gamepad2, History, Library, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RegionSelector } from "@/app/components/RegionSelector";
import { GoogleUser, UserMenu, WishlistGame } from "@/app/components/UserMenu";
import { ProblemReportButton } from "@/app/components/ProblemReportButton";
import { deleteWishlistItem, fetchWishlist, fetchWishlistAlerts, persistSession, readStoredUser, updateWishlistItem, type WishlistAlert } from "@/app/components/userPersistence";
import { formatGameCategory } from "@/lib/categories";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";
import { isAdminEmail } from "@/lib/admin";

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
    if (!user) return;
    const current = game.notificationPreferences ?? DEFAULT_PREFERENCES;
    const nextWishlist = await updateWishlistItem(user.sub, game.gameId, {
      notificationPreferences: { ...current, ...updates }
    });
    setWishlist(nextWishlist);
    setWishlistAlerts(await fetchWishlistAlerts(user.sub, region));
    const nextGame = nextWishlist.find((item) => item.gameId === game.gameId);
    if (nextGame) setBellMenu((currentMenu) => (currentMenu ? { ...currentMenu, game: nextGame } : currentMenu));
  }

  return (
    <div className="appShell">
      <nav className="brandBar">
        <div className="brandCluster">
          <div className="brand">GLITCHPRICE</div>
        </div>
        <div className="navTools">
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
          <Link href="/biblioteca" className="sideLink">
            <Library size={20} />
            Biblioteca
          </Link>
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

        {bellMenu ? <BellPreferencesMenu menu={bellMenu} onUpdate={updatePreferences} onClose={() => setBellMenu(null)} /> : null}
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
  onUpdate: (game: WishlistGame, updates: Partial<NonNullable<WishlistGame["notificationPreferences"]>>) => void;
  onClose: () => void;
}) {
  const preferences = menu.game.notificationPreferences ?? DEFAULT_PREFERENCES;
  return (
    <div
      className="bellPreferencesMenu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      aria-label={`Preferencias de ${menu.game.title}`}
    >
      <strong>Preferencias</strong>
      <label>
        <input type="checkbox" checked={preferences.priceDrop} onChange={(event) => onUpdate(menu.game, { priceDrop: event.target.checked })} />
        Notificar cuando baje de precio
      </label>
      <label>
        <input
          type="checkbox"
          checked={preferences.historicalLow}
          onChange={(event) => onUpdate(menu.game, { historicalLow: event.target.checked })}
        />
        Notificar cuando alcance mínimo
      </label>
      <label>
        <input type="checkbox" checked={preferences.belowUsd} onChange={(event) => onUpdate(menu.game, { belowUsd: event.target.checked })} />
        Notificar cuando baje de USD
        <input
          type="number"
          min="0"
          step="0.01"
          value={preferences.belowUsdValue ?? ""}
          placeholder="0.00"
          onChange={(event) => onUpdate(menu.game, { belowUsdValue: event.target.value ? Number(event.target.value) : null })}
        />
      </label>
      <button type="button" onClick={onClose}>
        Cerrar
      </button>
    </div>
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
