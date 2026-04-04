/**
 * Resolves the canonical base URL to use when building links that will be
 * shared with end users (invite links, email links, OAuth redirect URIs).
 *
 * Priority order:
 *  1. MEETING_INVITE_BASE_URL  — explicit override, always wins
 *  2. In development:
 *       - if NEXT_PUBLIC_APP_URL is a private-network IP but the request
 *         arrived from localhost, use the request origin instead so
 *         copied links stay on localhost and stay functional.
 *  3. NEXT_PUBLIC_APP_URL (or APP_URL / CLIENT_ORIGIN for back-compat)
 *  4. Request origin as last resort
 *  5. "http://localhost:3000" hard-coded fallback
 */

function isPrivateNetworkHostname(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveAppBaseUrl(req: Request): string {
  const explicitBase =
    process.env.MEETING_INVITE_BASE_URL?.trim();
  if (explicitBase) return explicitBase;

  const requestUrl = new URL(req.url);
  const requestOrigin = requestUrl.origin;

  const configuredAppUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.CLIENT_ORIGIN
  )?.trim();

  if (!configuredAppUrl) {
    return requestOrigin || "https://theofficeconnect.com";
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const configuredHost = new URL(configuredAppUrl).hostname.toLowerCase();
      const requestHost = requestUrl.hostname.toLowerCase();

      // In dev: if env points to a LAN IP but the request came from localhost,
      // the LAN IP won't work for the requesting user — use their origin instead.
      if (
        isPrivateNetworkHostname(configuredHost) &&
        isLoopbackHostname(requestHost)
      ) {
        return requestOrigin;
      }
    } catch {
      // Malformed configured URL — fall back to request origin.
      return requestOrigin || "https://theofficeconnect.com";
    }
  }

  return configuredAppUrl;
}
