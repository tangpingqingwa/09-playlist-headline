import { isIP } from "node:net";

/** Canonical listen URL: https only, tracking stripped, chat/NSFW/shorteners rejected. */

export class UrlError extends Error {
  constructor(
    readonly code: "url_insecure" | "url_forbidden",
    readonly httpStatus = 400,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "UrlError";
  }
}

/** Exact tracking / affiliate keys. `utm_*` and `ref_` are prefix-matched. */
export const TRACKING_QUERY_KEYS: readonly string[] = [
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "ref",
  "affiliate",
  "aff",
  "irclickid",
  "mc_cid",
  "mc_eid",
  "icid",
  "si",
  "igshid",
];

const TRACKING_KEY_SET = new Set(TRACKING_QUERY_KEYS);

/** Chat / invite hosts. Subdomains match. `discord.com` only `/invite`. */
export const CHAT_HOSTS: readonly string[] = [
  "t.me",
  "telegram.me",
  "telegram.org",
  "telegram.dog",
  "wa.me",
  "chat.whatsapp.com",
  "discord.gg",
  "m.me",
  "signal.me",
];

/** Known shorteners are not stored. Offline path rejects. */
export const SHORTENER_HOSTS: readonly string[] = [
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "lnkd.in",
];

/** Operator adult-host list. Subdomains match. Keep it boring. */
export const NSFW_HOSTS: readonly string[] = [
  "onlyfans.com",
  "fansly.com",
  "pornhub.com",
  "pornhub.org",
  "pornhubpremium.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "chaturbate.com",
  "stripchat.com",
  "manyvids.com",
  "redtube.com",
  "youporn.com",
  "brazzers.com",
  "adultfriendfinder.com",
  "spankbang.com",
];

const NSFW_PATH_TOKENS = new Set([
  "porn",
  "porno",
  "xxx",
  "nsfw",
  "onlyfans",
  "fansly",
  "hentai",
  "escort",
  "escorts",
  "camgirl",
  "camgirls",
  "nude",
  "nudes",
]);

const NSFW_COPY_RE =
  /\b(porn|porno|xxx|nsfw|onlyfans|fansly|hentai|escort|escorts|camgirl|camgirls|nude|nudes|naked)\b/i;

function hostMatches(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

function hostnameOf(parsed: URL): string {
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

function hasUrlScheme(raw: string): boolean {
  if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) return false;

  // A port on a scheme-less host is part of its authority, not a custom URI
  // scheme (`music.example:8443` → `https://music.example:8443`).
  return !/^(?:(?:[a-z\d-]+\.)+[a-z]{2,}|localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[^\]]+\]):\d+(?:[/?#]|$)/i.test(
    raw,
  );
}

function withHttpsScheme(raw: string): string {
  return raw.startsWith("//")
    ? `https:${raw}`
    : hasUrlScheme(raw)
      ? raw
      : `https://${raw}`;
}

export function isTrackingQueryKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.startsWith("utm_")) return true;
  if (lowered.startsWith("ref_")) return true;
  return TRACKING_KEY_SET.has(lowered);
}

export function isChatUrl(parsed: URL): boolean {
  const host = hostnameOf(parsed);
  if (CHAT_HOSTS.some((listed) => hostMatches(host, listed))) {
    return true;
  }
  if (hostMatches(host, "discord.com")) {
    const path = parsed.pathname.toLowerCase();
    return path === "/invite" || path.startsWith("/invite/");
  }
  return false;
}

export function isNsfwHost(host: string): boolean {
  const lowered = host.toLowerCase().replace(/\.$/, "");
  if (NSFW_HOSTS.some((listed) => hostMatches(lowered, listed))) {
    return true;
  }
  return lowered.split(".").some((label) => NSFW_PATH_TOKENS.has(label));
}

export function isNsfwPath(path: string): boolean {
  return path
    .toLowerCase()
    .split("/")
    .some((segment) => NSFW_PATH_TOKENS.has(segment));
}

export function isNsfwCopy(raw: string): boolean {
  return NSFW_COPY_RE.test(raw);
}

export function isShortenerHost(host: string): boolean {
  return SHORTENER_HOSTS.some((listed) => hostMatches(host.toLowerCase(), listed));
}

function parseIpv4(host: string): [number, number, number, number] | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return undefined;
  const octets = host.split(".").map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return octets as [number, number, number, number];
}

/** RFC 6890, RFC 5737, RFC 6598, and other non-public IPv4 allocations. */
function isPrivateOrReservedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a >= 240) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // shared address space
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 2) return true; // TEST-NET-1
  if (a === 192 && b === 31 && c === 196) return true; // 6to4 relay anycast
  if (a === 192 && b === 52 && c === 193) return true; // 6to4 relay anycast
  if (a === 192 && b === 88 && c === 99) return true; // deprecated 6to4 anycast
  if (a === 198 && b >= 18 && b <= 19) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  return false;
}

function parseIpv6(host: string): number[] | undefined {
  const unbracketed = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (unbracketed.includes("%") || isIP(unbracketed) !== 6) return undefined;
  const halves = unbracketed.split("::");
  if (halves.length > 2) return undefined;

  const parseHalf = (half: string): number[] | undefined => {
    if (!half) return [];
    const pieces = half.split(":");
    const result: number[] = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (!piece) return undefined;
      if (piece.includes(".")) {
        if (index !== pieces.length - 1) return undefined;
        const ipv4 = parseIpv4(piece);
        if (!ipv4) return undefined;
        result.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return undefined;
        result.push(Number.parseInt(piece, 16));
      }
    }
    return result;
  };

  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves.length === 2 ? halves[1] ?? "" : "");
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;
  if (left.length + right.length >= 8) return undefined;
  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right];
}

function isPrivateOrReservedIpv6(words: number[]): boolean {
  if (words.length !== 8) return false;
  const [a, b, c, d, e, f, g, h] = words;
  const mappedIpv4: [number, number, number, number] | undefined =
    a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff
      ? [g >> 8, g & 0xff, h >> 8, h & 0xff]
      : undefined;
  if (mappedIpv4 && isPrivateOrReservedIpv4(mappedIpv4)) return true;

  // Unspecified, loopback, IPv4-compatible, and IPv4-translated ranges.
  if (words.every((word) => word === 0) ||
      (words.slice(0, 7).every((word) => word === 0) && h === 1) ||
      (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) ||
      (a === 0x0064 && b === 0xff9b) || // 64:ff9b::/96 NAT64
      (a === 0x0064 && b === 0xff9b && c === 1)) {
    return true;
  }
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (a === 0xfec0 || (a & 0xffc0) === 0xfec0) return true; // deprecated site-local
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // 100::/64 discard
  if (a === 0x2001 && b === 0) return true; // Teredo / protocol assignments
  if (a === 0x2001 && b === 2 && c === 0) return true; // benchmarking
  if (a === 0x2001 && (b & 0xfff0) === 0x0010) return true; // ORCHID
  if (a === 0x2001 && b === 0xdb8) return true; // documentation
  if (a === 0x2002) return true; // 6to4 transition space
  return false;
}

/** True for host literals and local names that must never be embedded/redirected to. */
export function isPrivateOrReservedHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") || host === "home.arpa") {
    return true;
  }
  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateOrReservedIpv4(ipv4);
  const ipv6 = parseIpv6(host);
  return ipv6 ? isPrivateOrReservedIpv6(ipv6) : false;
}

/** Validate an externally supplied redirect/origin URL without following DNS. */
export function isSafePublicHttpsUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  const host = hostnameOf(parsed);
  return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" &&
    host !== "" && !isPrivateOrReservedHost(host);
}

function isUnusableHost(host: string): boolean {
  return isPrivateOrReservedHost(host);
}

function stripTracking(parsed: URL): void {
  for (const key of [...parsed.searchParams.keys()]) {
    if (isTrackingQueryKey(key)) {
      parsed.searchParams.delete(key);
    }
  }
}

/**
 * Require https (defaulting bare host/path input to it), drop fragment, strip
 * tracking keys, reject chat / NSFW / shorteners / credentials / localhost.
 * Store and click this URL only.
 */
export function canonicalizeListenUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    throw new UrlError("url_insecure");
  }
  // WHATWG URL parsing removes ASCII controls such as tabs and newlines
  // before interpreting a scheme. Reject them first so an obfuscated unsafe
  // scheme cannot fall through to the bare-host HTTPS default.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new UrlError("url_insecure");
  }

  let parsed: URL;
  try {
    // The form accepts a listen host/path without a scheme. Preserve an
    // explicitly supplied scheme so `http:` and other unsafe protocols still
    // fail below rather than being silently upgraded.
    parsed = new URL(withHttpsScheme(trimmed));
  } catch {
    throw new UrlError("url_insecure");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:") {
    throw new UrlError("url_insecure");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlError("url_forbidden");
  }

  const host = hostnameOf(parsed);
  if (!host || isUnusableHost(host)) {
    throw new UrlError("url_forbidden");
  }
  if (isShortenerHost(host)) {
    throw new UrlError("url_forbidden");
  }
  if (isChatUrl(parsed) || isNsfwHost(host) || isNsfwPath(parsed.pathname)) {
    throw new UrlError("url_forbidden");
  }

  parsed.hash = "";
  parsed.hostname = host;
  if (parsed.port === "443") {
    parsed.port = "";
  }
  stripTracking(parsed);
  return parsed.toString();
}
