export const ADMIN_EMAILS = ["shuxteam@gmail.com", "franappignanesi@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}
