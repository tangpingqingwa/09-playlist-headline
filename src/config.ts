import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { isSafePublicHttpsUrl } from "./core/url";

export type WaffoEnv = Record<string, string | undefined>;

export type WaffoMode = "fixture" | "waffo-test" | "waffo-prod";

export const DEFAULT_DATABASE_PATH = "./data/playlist-headline.sqlite";
export const WAFFO_OFFICIAL_API_BASE = "https://api.waffo.ai";

function isMemoryDatabasePath(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === ":memory:" ||
    normalized.startsWith("file::memory:") ||
    normalized.includes("mode=memory");
}

/** SQLite file used by the server. Tests set DATABASE_PATH=:memory:. */
export function databasePath(env: WaffoEnv = process.env): string {
  const configured = env.DATABASE_PATH?.trim();
  if (isProductionLike(env) && isMemoryDatabasePath(configured)) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
  }
  return configured || DEFAULT_DATABASE_PATH;
}

/** Runtime mode is deliberately explicit; legacy payment selectors are inert. */
export function waffoMode(env: WaffoEnv = process.env): WaffoMode {
  const raw = env.WAFFO_MODE?.trim();
  if (raw === "fixture") return "fixture";
  if (raw === "waffo-test") return "waffo-test";
  if (raw === "waffo-prod") return "waffo-prod";
  throw new Error("BLOCKED-CONFIG: WAFFO_MODE (fixture, waffo-test, or waffo-prod)");
}

export function isProductionLike(env: WaffoEnv = process.env): boolean {
  const mode = env.WAFFO_MODE?.trim().toLowerCase();
  const deployment = [env.VERCEL_ENV, env.APP_ENV, env.DEPLOY_ENV, env.BUILD_ENV]
    .map((value) => value?.trim().toLowerCase())
    .some((value) => value === "production" || value === "prod" || value === "live");
  return env.NODE_ENV?.trim().toLowerCase() === "production" ||
    deployment || env.NEXT_PHASE?.trim() === "phase-production-build" ||
    mode === "waffo-prod" || mode === "prod";
}

/** A fixture can never be selected by a production process. */
export function assertWaffoModeAllowed(
  mode: WaffoMode,
  env: WaffoEnv = process.env,
): void {
  if (isProductionLike(env) && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE waffo-prod is required in production");
  }
}

const WAFFO_SHORT_ID = /^(?:MER|STO|PROD)_[0-9A-Za-z]{22}$/;

/**
 * Validate every setting required before a live checkout or healthy response.
 * The optional key is only for an adapter test that injects an in-memory key;
 * the health path never supplies it and therefore requires the mode-scoped
 * environment variable.
 */
export function assertRuntimeReadiness(
  env: WaffoEnv = process.env,
  injectedWebhookPublicKey?: string,
): WaffoMode {
  const mode = waffoMode(env);
  assertWaffoModeAllowed(mode, env);
  if (mode === "fixture") return mode;

  const ids: Array<[string, string]> = [
    ["WAFFO_MERCHANT_ID", "MER"],
    ["WAFFO_STORE_ID", "STO"],
    ["WAFFO_PRODUCT_ID", "PROD"],
  ];
  for (const [name, prefix] of ids) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`BLOCKED-CONFIG: ${name}`);
    if (!WAFFO_SHORT_ID.test(value) || !value.startsWith(`${prefix}_`)) {
      throw new Error(`BLOCKED-CONFIG: ${name} must be a ${prefix}_ Short ID`);
    }
  }

  const privateKey = readPrivateKey(env);
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY must be an RSA private key");
  }

  const keyName = mode === "waffo-prod"
    ? "WAFFO_WEBHOOK_PROD_PUBLIC_KEY"
    : "WAFFO_WEBHOOK_TEST_PUBLIC_KEY";
  const webhookKey = injectedWebhookPublicKey?.trim() || env[keyName]?.trim();
  if (!webhookKey) throw new Error(`BLOCKED-CONFIG: ${keyName}`);
  assertRsaPublicKey(keyName, webhookKey);

  requireHttpsPublicBaseUrl(env);
  waffoApiBase(env, mode);
  const database = env.DATABASE_PATH?.trim();
  if (!database || isMemoryDatabasePath(database)) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
  }
  return mode;
}

function readPrivateKey(env: WaffoEnv): string {
  const inline = env.WAFFO_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const file = env.WAFFO_PRIVATE_KEY_FILE?.trim();
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY_FILE");
    }
  }
  throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY");
}

function assertRsaPublicKey(name: string, value: string): void {
  try {
    const normalized = value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
    const key = createPublicKey(normalized);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
  } catch {
    throw new Error(`BLOCKED-CONFIG: ${name} must be an RSA public key`);
  }
}

export function waffoEnvironment(mode: WaffoMode): "test" | "prod" {
  return mode === "waffo-prod" ? "prod" : "test";
}

export function publicBaseUrl(env: WaffoEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  if (isProductionLike(env)) {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL");
  }
  return "http://localhost:3000";
}

export function requireHttpsPublicBaseUrl(env: WaffoEnv = process.env): string {
  const base = publicBaseUrl(env);
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be an origin");
  }
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be an origin");
  }
  const origin = parsed.origin;
  if (isProductionLike(env) && (!isSafePublicHttpsUrl(origin) || parsed.protocol !== "https:")) {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be a public HTTPS origin without credentials");
  }
  return origin;
}

/**
 * Production requests must use the official Waffo API origin. A test override
 * is useful for an offline HTTP fixture, but it is explicit and still cannot
 * smuggle credentials or point at a local/private host.
 */
export function waffoApiBase(
  env: WaffoEnv = process.env,
  mode: WaffoMode = waffoMode(env),
): string {
  const configured = env.WAFFO_API_BASE?.trim();
  if (mode === "waffo-prod" || isProductionLike(env)) {
    if (configured && normalizeOrigin(configured) !== WAFFO_OFFICIAL_API_BASE) {
      throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must use the official Waffo origin");
    }
    return WAFFO_OFFICIAL_API_BASE;
  }
  if (!configured) return WAFFO_OFFICIAL_API_BASE;
  if (!isSafePublicHttpsUrl(configured)) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be a public HTTPS origin without credentials");
  }
  return normalizeOrigin(configured);
}

function normalizeOrigin(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be an origin");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be an origin");
  }
  return parsed.origin;
}
