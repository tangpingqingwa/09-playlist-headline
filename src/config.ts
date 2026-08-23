export type PolarEnv = Record<string, string | undefined>;

/** Live Polar only when POLAR_LIVE=1. Unset / 0 / true stay fixture. */
export function polarLiveEnabled(env: PolarEnv = process.env): boolean {
  if (env.POLAR_FIXTURE_ONLY === "1") return false;
  return env.POLAR_LIVE === "1";
}

export function polarAccessToken(env: PolarEnv = process.env): string | undefined {
  const token = env.POLAR_ACCESS_TOKEN;
  return token && token.trim() !== "" ? token : undefined;
}

export function polarWebhookSecret(env: PolarEnv = process.env): string | undefined {
  const secret = env.POLAR_WEBHOOK_SECRET;
  return secret && secret.trim() !== "" ? secret : undefined;
}

/** Optional Polar product. Sandbox custom-amount checkout needs product_id. */
export function polarProductId(env: PolarEnv = process.env): string | undefined {
  const id = env.POLAR_PRODUCT_ID?.trim();
  return id ? id : undefined;
}

export function publicBaseUrl(env: PolarEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}
