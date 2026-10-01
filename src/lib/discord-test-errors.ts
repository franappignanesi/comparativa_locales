import { DiscordApiError } from "./discord-api";

export function discordTestFailure(error: unknown, delivered = false) {
  if (delivered) return { status: 503, error: "Discord confirmó el envío, pero no pudimos guardar la verificación. No repitas la prueba; contactanos para revisar la conexión." };
  if (!(error instanceof DiscordApiError) || error.ambiguous) return { status: 502, error: "No pudimos confirmar el envío. Si el mensaje llegó, no repitas la prueba; contactanos. Si no llegó, aguardá antes de reintentar." };
  if (error.reason === "recipient_not_allowed") return { status: 403, error: "Discord está en modo de prueba y tu cuenta conectada no está autorizada todavía. Contactanos para habilitarla." };
  if (error.reason === "sending_paused" || error.status === 503) return { status: 503, error: "Los envíos de Discord están pausados o no están configurados. Contactanos si el problema continúa." };
  if (error.status === 401) return { status: 503, error: "No pudimos autenticar el bot de Discord. Es un problema del servicio, no de tus permisos. Contactanos." };
  if (error.status === 429) return { status: 429, error: "Se alcanzó un límite de envío. Aguardá antes de volver a probar." };
  if (error.providerCode === 50007) return { status: 403, error: "Discord no permite enviarte un MD. Confirmá que el bot Shux esté en el servidor de SHUX y que permitas mensajes directos de sus miembros; revisá también si lo bloqueaste." };
  if (error.status === 403) return { status: 403, error: "Discord rechazó el acceso del bot. Revisá que esté agregado al servidor de SHUX y que puedas recibir sus MD." };
  return { status: 502, error: "Discord rechazó el mensaje de prueba. Es un problema del servicio; contactanos para que revisemos el envío." };
}
