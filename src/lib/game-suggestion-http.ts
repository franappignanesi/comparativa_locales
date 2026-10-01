import { NextResponse } from "next/server";

export function suggestionOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
export async function suggestionBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw Error("Formato no válido.");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Faltan datos.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) throw Error("La solicitud es demasiado grande.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Formato no válido.");
  return value;
}
export function suggestionError(message: string, status = 400) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}
