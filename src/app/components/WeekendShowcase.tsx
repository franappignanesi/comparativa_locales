"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatWeekendDate, type WeekendGame } from "@/lib/weekend-games";
import type { LatestPrices, StoreId } from "@/lib/types";

type CalendarGame = WeekendGame & { gameId: string; coverUrl: string | null };
type PriceRow = LatestPrices["prices"][number];

export function WeekendShowcase({ games, offers, enabledStores, onOpen }: {
  games: CalendarGame[]; offers: PriceRow[]; enabledStores: StoreId[]; onOpen: (gameId: string) => void;
}) {
  const months = [...new Set(games.flatMap((game) => game.reviewDate ? [game.reviewDate.slice(0, 7)] : []))].sort().reverse();
  const [chosenMonth, setChosenMonth] = useState(months[0] ?? "");
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const month = months.includes(chosenMonth) ? chosenMonth : months[0] ?? "";
  const monthIndex = months.indexOf(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leadingDays = (firstDate.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthGames = games.filter((game) => game.reviewDate?.startsWith(month));
  const visibleGames = chosenDay ? monthGames.filter((game) => game.reviewDate === chosenDay) : monthGames;
  const monthTitle = (value: string) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
  function changeMonth(value: string) { setChosenMonth(value); setChosenDay(null); }
  function offer(row: PriceRow) {
    return Math.max(0, ...enabledStores.map((store) => {
      const price = row.prices[store];
      if (!price?.available) return 0;
      if (price.discountPct) return price.discountPct;
      return price.arsBasePrice && price.arsFinalPrice != null ? Math.round((1 - price.arsFinalPrice / price.arsBasePrice) * 100) : 0;
    }));
  }
  return (
    <div className="weekendShowcase">
      <header className="weekendIntro">
        <span className="weekendEyebrow">LA SELECCIÓN DE SHUX</span>
        <h1>Juego del finde</h1>
        <p>El finde pide un buen juego. Acá reunimos los que pasaron por Shux: descubrimientos, clásicos y unas cuantas horas bien gastadas. Elegí el próximo y encontrá dónde comprarlo más barato.</p>
      </header>
      {months.length ? <section className="weekendCalendarSection" aria-label="Calendario de juegos del finde">
        <div className="weekendCalendar">
          <div className="weekendCalendarToolbar">
            <button type="button" disabled={monthIndex >= months.length - 1} title="Mes anterior con recomendaciones" aria-label="Mes anterior con recomendaciones" onClick={() => changeMonth(months[monthIndex + 1])}><ChevronLeft size={20} /></button>
            <select aria-label="Mes de recomendaciones" value={month} onChange={(event) => changeMonth(event.target.value)}>{months.map((value) => <option key={value} value={value}>{monthTitle(value)}</option>)}</select>
            <button type="button" disabled={monthIndex <= 0} title="Mes siguiente con recomendaciones" aria-label="Mes siguiente con recomendaciones" onClick={() => changeMonth(months[monthIndex - 1])}><ChevronRight size={20} /></button>
          </div>
          <p className="weekendCalendarCaption">{monthGames.length} {monthGames.length === 1 ? "juego publicado" : "juegos publicados"} en Mentor</p>
          <div className="weekendCalendarGrid">
            {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span className="weekendWeekday" key={index} aria-hidden="true">{day}</span>)}
            {Array.from({ length: leadingDays }, (_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const day = index + 1;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const reviews = monthGames.filter((game) => game.reviewDate === date);
              return <button key={date} type="button" className={`${reviews.length ? "hasWeekendGame" : ""} ${chosenDay === date ? "selected" : ""}`} disabled={!reviews.length} aria-pressed={chosenDay === date} aria-label={`${day} de ${monthTitle(month)}${reviews.length ? `: ${reviews.map((r) => r.title).join(", ")}` : ""}`} title={reviews.map((r) => r.title).join(", ")} onClick={() => setChosenDay(chosenDay === date ? null : date)}>{day}{reviews.length ? <i /> : null}</button>;
            })}
          </div>
        </div>
        <div className="weekendCalendarSelection">
          <h2>{chosenDay ? chosenDay.split("-").reverse().join("/") : monthTitle(month)}</h2>
          <div className="weekendCalendarGames">
            {visibleGames.map((game) => <button type="button" key={game.gameId} onClick={() => onOpen(game.gameId)}>
              {game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy" /> : null}
              <span><strong>{game.title}</strong><small>{formatWeekendDate(game)}</small></span>
              <ChevronRight size={18} />
            </button>)}
          </div>
        </div>
      </section> : null}
      {offers.length ? <section className="weekendOffers" aria-label="Ofertas destacadas de juegos del finde">
        <h2>Buen finde, mejor precio</h2>
        <div className="weekendOfferGrid">{offers.map((row) => <button type="button" key={row.gameId} onClick={() => onOpen(row.gameId)}>
          {row.coverUrl ? <img src={row.coverUrl} alt="" loading="lazy" /> : null}
          <span><strong>{row.gameTitle}</strong><b>-{Math.round(offer(row))}%</b></span>
        </button>)}</div>
      </section> : null}
    </div>
  );
}
