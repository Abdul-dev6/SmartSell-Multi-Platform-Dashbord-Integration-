import { vi } from "vitest";
import { LWA_TOKEN_URL } from "@/lib/amazon/config";

// A fake Amazon (LWA + SP-API) behind a stubbed global fetch. Tests register
// handlers with on("METHOD /path/:param", handler); handler(req) returns a
// Response (or a plain object for a 200 JSON body). Every request is recorded.
// Unhandled requests fail loudly. Nothing reaches the network.

export const json = (body, status = 200, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const PRODUCTION = "https://sellingpartnerapi-na.amazon.com";
export const SANDBOX = "https://sandbox.sellingpartnerapi-na.amazon.com";
export const SCHEMA_URL = "https://selling-partner-definitions-prod-iad.s3.amazonaws.com/schema/luggage.json";

export function installFakeAmazon({ origin = PRODUCTION } = {}) {
  const routes = [];
  const requests = [];
  const lwaCalls = [];
  const fake = {
    origin,
    requests,
    lwaCalls,
    // LWA behaviour, per grant type.
    lwa: {
      refresh_token: () => json({ access_token: `Atza|access-${lwaCalls.length}`, token_type: "bearer", expires_in: 3600 }),
      authorization_code: (p) =>
        p.get("code") === "good-code"
          ? json({ access_token: "Atza|first-access", refresh_token: "Atzr|seller-refresh-token", token_type: "bearer", expires_in: 3600 })
          : json({ error: "invalid_grant", error_description: "The authorization code is invalid" }, 400),
    },
    on(spec, handler) {
      const [method, pattern] = spec.split(" ");
      const keys = [];
      const re = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, (m) => (keys.push(m.slice(1)), "([^/]+)"))}$`);
      routes.unshift({ method, re, keys, handler });
      return fake;
    },
    calls(spec) {
      const [method, pattern] = spec.split(" ");
      const re = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "[^/]+")}$`);
      return requests.filter((r) => r.method === method && re.test(r.path));
    },
    externals: {},
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      if (String(input) === LWA_TOKEN_URL) {
        const params = new URLSearchParams(init.body.toString());
        lwaCalls.push(params);
        return fake.lwa[params.get("grant_type")]?.(params) ?? json({ error: "unsupported_grant_type" }, 400);
      }
      if (fake.externals[url.href]) return fake.externals[url.href]();
      if (url.origin !== fake.origin) throw new Error(`Unexpected request to ${url.origin}`);
      const req = {
        method: init.method || "GET",
        path: decodeURIComponent(url.pathname),
        query: url.searchParams,
        headers: init.headers || {},
        body: init.body ? JSON.parse(init.body) : undefined,
      };
      requests.push(req);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        req.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler(req);
        return out instanceof Response ? out : json(out);
      }
      throw new Error(`No fake Amazon route for ${req.method} ${req.path}`);
    }),
  );
  return fake;
}

// Production-mode environment (connect enabled unless told otherwise).
export function productionEnv({ connect = true } = {}) {
  process.env.AMAZON_ENVIRONMENT = "production";
  process.env.AMAZON_PRODUCTION_CLIENT_ID = "amzn1.application-oa2-client.prod-test";
  process.env.AMAZON_PRODUCTION_CLIENT_SECRET = "prod-client-secret-value";
  process.env.AMAZON_APP_ID = "amzn1.sellerapps.app.test-app-id";
  process.env.AMAZON_REDIRECT_URI = "https://smartsell.example.com/api/amazon/callback";
  process.env.AMAZON_AUTH_BETA = "true";
  process.env.AMAZON_CONNECT_ENABLED = connect ? "true" : "false";
  process.env.AMAZON_REGION = "NA";
}

export function clearAmazonEnv() {
  for (const k of [
    "AMAZON_ENVIRONMENT",
    "AMAZON_PRODUCTION_CLIENT_ID",
    "AMAZON_PRODUCTION_CLIENT_SECRET",
    "AMAZON_APP_ID",
    "AMAZON_REDIRECT_URI",
    "AMAZON_AUTH_BETA",
    "AMAZON_CONNECT_ENABLED",
    "AMAZON_REGION",
    "AMAZON_SANDBOX_CLIENT_ID",
    "AMAZON_SANDBOX_CLIENT_SECRET",
    "AMAZON_SANDBOX_REFRESH_TOKEN",
  ]) delete process.env[k];
}
