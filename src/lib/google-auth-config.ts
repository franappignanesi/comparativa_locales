import { PUBLIC_GOOGLE_CLIENT_ID } from "@/lib/google-auth-public";

export function getGoogleClientId(): string | null {
  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? process.env["NEXT_PUBLIC_GOOGLE_CLIENT_ID"] ?? PUBLIC_GOOGLE_CLIENT_ID;
  return clientId?.trim() || null;
}
