import { PUBLIC_GOOGLE_CLIENT_ID } from "@/lib/google-auth-public";

export { PUBLIC_GOOGLE_CLIENT_ID };

export function getGoogleClientId(): string {
  return PUBLIC_GOOGLE_CLIENT_ID;
}
