import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { resolveSuggestionPreview } from "@/lib/game-suggestion-preview";
import { saveGameSuggestion, suggestionRateLimit } from "@/lib/game-suggestion-store";
import { suggestionBody, suggestionError, suggestionOriginAllowed } from "@/lib/game-suggestion-http";

export async function POST(request: Request) {
  const user = getCurrentUser(request);
  if (!user) return suggestionError("Iniciá sesión para proponer juegos.", 401);
  if (!suggestionOriginAllowed(request)) return suggestionError("Solicitud no permitida.", 403);
  let body;
  try { body = await suggestionBody(request); } catch { return suggestionError("Revisá los datos enviados."); }
  const previewOnly = body.action === "preview";
  try {
    if (!await suggestionRateLimit(user.sub, previewOnly ? "preview" : "submit", previewOnly ? 20 : 5, previewOnly ? 600 : 86400)
      || !await suggestionRateLimit("global", "requests", 2000, 86400)) return suggestionError("Llegaste al límite. Probá más tarde.", 429);
    const preview = await resolveSuggestionPreview(body.url);
    if (previewOnly || preview.existingGameId) return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    const title = preview.title ?? (typeof body.title === "string" ? body.title.trim().slice(0, 200) : null);
    const id = await saveGameSuggestion({ ...preview, title }, user.sub);
    return NextResponse.json({ ok: true, id, preview: { ...preview, title } });
  } catch (e) {
    if (e instanceof Error && /enlace|HTTPS|Admitimos|Pegá/.test(e.message)) return suggestionError(e.message);
    console.error("[suggestions] request failed");
    return suggestionError("No pudimos guardar la propuesta. Probá en unos minutos.", 503);
  }
}
