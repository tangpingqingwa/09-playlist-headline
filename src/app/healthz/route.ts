import { NextResponse } from "next/server";
import { type WaffoEnv } from "../../config";
import { probeRuntimeReadiness } from "../../runtime/readiness";

type HealthzOk = {
  ok: true;
};

type HealthzFailure = {
  ok: false;
  error: "configuration_unavailable";
};

export function healthResponse(env: WaffoEnv = process.env): NextResponse<HealthzOk | HealthzFailure> {
  try {
    probeRuntimeReadiness(env);
    return NextResponse.json({ ok: true } satisfies HealthzOk);
  } catch {
    /* Do not report healthy traffic when a live provider can not be safely
       correlated. Details stay in server logs/config diagnostics, not in the
       public health response. */
    return NextResponse.json(
      { ok: false, error: "configuration_unavailable" } satisfies HealthzFailure,
      { status: 503 },
    );
  }
}

export function GET(): NextResponse<HealthzOk | HealthzFailure> {
  return healthResponse();
}
