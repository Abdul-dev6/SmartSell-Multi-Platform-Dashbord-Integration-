// Cross-site request forgery guard for state-changing API calls.
//
// The session cookie is SameSite=Lax, which already stops other sites from
// sending it with POST/PATCH/DELETE. This is a second, independent check:
// browsers label every request with Sec-Fetch-Site and/or Origin, and a
// request another site started is refused even if a cookie would be sent
// (for example from a sibling subdomain once a custom domain is used).
//
// Requests without either header do not come from a browser page (Shopify
// webhooks, Vercel Cron, server-to-server calls) and cannot carry a
// victim's cookies, so they are left to the route's own authentication.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHosts(req) {
  const hosts = new Set([req.nextUrl.host]);
  for (const header of ["host", "x-forwarded-host"]) {
    const value = req.headers.get(header);
    if (value) hosts.add(value.split(",")[0].trim().toLowerCase());
  }
  return hosts;
}

export function isCrossSiteRequest(req) {
  if (SAFE_METHODS.has(req.method)) return false;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    // "none" = typed in the address bar / bookmark; never for fetch/forms.
    return fetchSite !== "same-origin" && fetchSite !== "none";
  }

  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true; // sandboxed frames, data: URLs
  try {
    return !requestHosts(req).has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}
