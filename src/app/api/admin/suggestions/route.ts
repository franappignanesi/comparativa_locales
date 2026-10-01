import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { isAdminEmail } from "@/lib/admin";
import { changeSuggestion, listGameSuggestions, suggestionRateLimit } from "@/lib/game-suggestion-store";
import { suggestionBody, suggestionError, suggestionOriginAllowed } from "@/lib/game-suggestion-http";

function authorize(request: Request) {
  const user = getCurrentUser(request);
  return !user ? suggestionError("Iniciá sesión.", 401) : !isAdminEmail(user.email) ? suggestionError("Sin permisos.", 403) : user;
}
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof NextResponse) return user;
  try { return NextResponse.json({ suggestions: await listGameSuggestions() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return suggestionError("No pudimos cargar las propuestas.", 503); }
}
export async function PATCH(request: Request) {
  const user = authorize(request);
  if (user instanceof NextResponse) return user;
  if (!suggestionOriginAllowed(request)) return suggestionError("Solicitud no permitida.", 403);
  try {
    const body = await suggestionBody(request);
    if (!["search", "approve", "discard"].includes(String(body.action))) return suggestionError("Acción no válida.");
    const id = body.id === null ? null : typeof body.id === "string" && /^[a-f0-9]{64}$/.test(body.id) ? body.id : undefined;
    if (id === undefined || (!id && body.action !== "search")) return suggestionError("Propuesta no válida.");
    if (!await suggestionRateLimit(user.sub, "admin", 60, 600)) return suggestionError("Probá de nuevo más tarde.", 429);
    const changed = await changeSuggestion(id, body.action as "search" | "approve" | "discard");
    if (!changed) return suggestionError("La propuesta cambió de estado. Actualizá la lista.", 409);
    return NextResponse.json({ changed, suggestions: await listGameSuggestions() });
  } catch { return suggestionError("No pudimos actualizar las propuestas.", 503); }
}
