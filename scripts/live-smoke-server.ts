import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "../src/app/about/page";
import { POST as postCheckout } from "../src/app/api/checkout/route";
import { POST as postWaffoWebhook } from "../src/app/api/waffo/webhook/route";
import { GET as getClick } from "../src/app/click/[id]/route";
import { GET as getHealthz } from "../src/app/healthz/route";
import HomePage from "../src/app/page";
import ReturnPage from "../src/app/return/page";
import RulesPage from "../src/app/rules/page";

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT is required");
}
const origin = process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;

function htmlDocument(node: ReactNode): string {
  // Layout imports board.css; tsx cannot load CSS. Pages carry the SPEC copy.
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Playlist Headline</title></head><body>${renderToStaticMarkup(node)}</body></html>`;
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function sendWeb(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

function sendHtml(res: ServerResponse, node: ReactNode): void {
  const body = htmlDocument(node);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "private, no-store");
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

const server = createServer((req, res) => {
  void (async () => {
    const request = await toRequest(req);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/healthz") {
      await sendWeb(res, getHealthz());
      return;
    }
    if (request.method === "GET" && path === "/") {
      sendHtml(res, createElement(HomePage));
      return;
    }
    if (request.method === "GET" && path === "/about") {
      sendHtml(res, createElement(AboutPage));
      return;
    }
    if (request.method === "GET" && path === "/rules") {
      sendHtml(res, createElement(RulesPage));
      return;
    }
    if (request.method === "GET" && path === "/return") {
      const searchParams = {
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        checkoutId: url.searchParams.get("checkoutId") ?? undefined,
        intent: url.searchParams.get("intent") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      };
      sendHtml(res, await ReturnPage({ searchParams: Promise.resolve(searchParams) }));
      return;
    }
    if (request.method === "GET" && path === "/checkout/complete") {
      const searchParams = {
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        checkoutId: url.searchParams.get("checkoutId") ?? undefined,
        intent: url.searchParams.get("intent") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      };
      /* The disposable renderer cannot stream an async nested server
         component. Resolve the same read-only return implementation directly
         so `/checkout/complete` is exercised without any settlement side
         effect. */
      sendHtml(res, await ReturnPage({ searchParams: Promise.resolve(searchParams) }));
      return;
    }
    if (request.method === "POST" && (path === "/api/checkout" || path === "/checkout")) {
      await sendWeb(res, await postCheckout(request));
      return;
    }
    if (request.method === "POST" && path === "/api/waffo/webhook") {
      await sendWeb(res, await postWaffoWebhook(request));
      return;
    }
    if (request.method === "POST" && path === "/api/polar/webhook") {
      sendWeb(res, new Response(JSON.stringify({ error: "waffo_webhook_required" }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }));
      return;
    }
    const click = path.match(/^\/click\/([^/]+)$/);
    if (request.method === "GET" && click) {
      await sendWeb(
        res,
        await getClick(request, { params: { id: decodeURIComponent(click[1]) } }),
      );
      return;
    }
    sendText(res, 404, "not found");
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    if (!res.headersSent) sendText(res, 500, message);
    else res.end();
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`live-smoke listening ${origin}\n`);
});
