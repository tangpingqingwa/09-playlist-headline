import { createHash, randomBytes } from "node:crypto";

/** Opaque, bearer-style browser claimant. Only its digest is persisted. */
export const CLAIMANT_COOKIE = "playlist_headline_claimant";
const CLAIMANT_BYTES = 32;

export function createClaimantToken(): string {
  return randomBytes(CLAIMANT_BYTES).toString("base64url");
}

export function claimantTokenHash(token: string | undefined): string | undefined {
  if (!token) return undefined;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function claimantFromCookieHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== CLAIMANT_COOKIE) continue;
    const value = decodeCookieValue(part.slice(separator + 1).trim());
    return value ? claimantTokenHash(value) : undefined;
  }
  return undefined;
}

function decodeCookieValue(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return /^[A-Za-z0-9_-]{43}$/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}
