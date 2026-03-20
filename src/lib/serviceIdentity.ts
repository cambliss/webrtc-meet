import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export type ServiceAuthMode = "off" | "optional" | "required";

export type ServiceTokenClaims = JwtPayload & {
  service: string;
  scopes?: string[] | string;
  workspaceId?: string;
  cnf?: {
    "x5t#S256"?: string;
  };
};

export type ServiceTokenSignInput = {
  service: string;
  audience: string | string[];
  scopes: string[];
  workspaceId?: string;
  subject?: string;
  expiresInSeconds?: number;
  mtlsCertThumbprint?: string;
};

export type VerifiedServiceIdentity = {
  claims: ServiceTokenClaims;
  scopes: Set<string>;
};

function parseAudienceList(raw: string | undefined, fallback: string): string[] {
  const values = (raw || fallback)
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : [fallback];
}

function toAudienceInput(values: string[]): string | [string, ...string[]] {
  if (values.length === 1) {
    return values[0];
  }

  return [values[0], ...values.slice(1)];
}

export function getNextApiServiceAudience(): string | [string, ...string[]] {
  return toAudienceInput(parseAudienceList(process.env.SERVICE_AUTH_NEXT_API_AUDIENCE, "next-api"));
}

export function getSignalingInternalServiceAudience(): string | [string, ...string[]] {
  return toAudienceInput(
    parseAudienceList(process.env.SERVICE_AUTH_SIGNALING_INTERNAL_AUDIENCE, "signaling-internal"),
  );
}

export function getServiceAuthMode(): ServiceAuthMode {
  const mode = String(process.env.SERVICE_AUTH_MODE || "optional").toLowerCase();
  if (mode === "off" || mode === "required") {
    return mode;
  }
  return "optional";
}

function getServiceAuthSecret(): string | null {
  const value = process.env.SERVICE_AUTH_SIGNING_SECRET;
  if (!value || !value.trim()) {
    return null;
  }
  return value;
}

function getIssuer(): string {
  return process.env.SERVICE_AUTH_ISSUER || "video-meeting-app.local";
}

function getClockToleranceSeconds(): number {
  const value = Number(process.env.SERVICE_AUTH_CLOCK_TOLERANCE_SECONDS || "60");
  if (!Number.isFinite(value) || value < 0) {
    return 60;
  }
  return value;
}

function getClientCertHeaderName(): string {
  return (process.env.SERVICE_AUTH_CLIENT_CERT_HEADER || "x-client-cert-thumbprint").toLowerCase();
}

export function shouldRequireMutualTls(): boolean {
  return String(process.env.SERVICE_AUTH_REQUIRE_MTLS || "false").toLowerCase() === "true";
}

function parseScopes(raw: ServiceTokenClaims["scopes"]): Set<string> {
  if (!raw) {
    return new Set();
  }

  if (Array.isArray(raw)) {
    return new Set(raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
  }

  if (typeof raw === "string") {
    return new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
  }

  return new Set();
}

function extractServiceToken(rawAuthHeader: string | null, rawHeaderToken: string | null): string | null {
  if (rawAuthHeader && rawAuthHeader.startsWith("Bearer ")) {
    const token = rawAuthHeader.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  if (rawHeaderToken && rawHeaderToken.trim()) {
    return rawHeaderToken.trim();
  }

  return null;
}

function hasRequiredScopes(actual: Set<string>, required: string[]): boolean {
  if (required.length === 0) {
    return true;
  }

  return required.every((scope) => actual.has(scope));
}

export function signServiceToken(input: ServiceTokenSignInput): string {
  const secret = getServiceAuthSecret();
  if (!secret) {
    throw new Error("SERVICE_AUTH_SIGNING_SECRET is not configured");
  }

  const payload: ServiceTokenClaims = {
    service: input.service,
    scopes: input.scopes,
    workspaceId: input.workspaceId,
  };

  if (input.mtlsCertThumbprint) {
    payload.cnf = {
      "x5t#S256": input.mtlsCertThumbprint,
    };
  }

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: getIssuer(),
    audience: input.audience,
    subject: input.subject,
    expiresIn: input.expiresInSeconds || 300,
    jwtid: randomUUID(),
  });
}

export function resolveScopedServiceWorkspaceId(params: {
  identity: VerifiedServiceIdentity;
  headerWorkspaceId?: string | null;
}): string {
  const claimWorkspaceId =
    typeof params.identity.claims.workspaceId === "string"
      ? params.identity.claims.workspaceId.trim()
      : "";
  const headerWorkspaceId = params.headerWorkspaceId?.trim() || "";

  if (headerWorkspaceId && claimWorkspaceId && headerWorkspaceId !== claimWorkspaceId) {
    throw new Error("Workspace header does not match service token scope");
  }

  if (!claimWorkspaceId) {
    throw new Error("Service token is missing workspace scope");
  }

  return claimWorkspaceId;
}

export function verifyServiceToken(params: {
  token: string;
  audience: string | string[];
  requiredScopes?: string[];
  presentedClientCertThumbprint?: string | null;
}): VerifiedServiceIdentity {
  const secret = getServiceAuthSecret();
  if (!secret) {
    throw new Error("Service auth secret is not configured");
  }

  const audience = Array.isArray(params.audience)
    ? (params.audience.length === 1 ? params.audience[0] : ([...params.audience] as [string, ...string[]]))
    : params.audience;

  const decoded = jwt.verify(params.token, secret, {
    algorithms: ["HS256"],
    issuer: getIssuer(),
    audience,
    clockTolerance: getClockToleranceSeconds(),
  }) as unknown;

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid service token payload");
  }

  const verified = decoded as ServiceTokenClaims;
  if (typeof verified.service !== "string" || !verified.service.trim()) {
    throw new Error("Service token is missing service identity");
  }

  const scopes = parseScopes(verified.scopes);
  const requiredScopes = params.requiredScopes || [];
  if (!hasRequiredScopes(scopes, requiredScopes)) {
    throw new Error("Missing required service scopes");
  }

  const claimedThumbprint = verified.cnf?.["x5t#S256"] || null;
  const requireMtls = shouldRequireMutualTls();
  if (requireMtls && !params.presentedClientCertThumbprint) {
    throw new Error("mTLS client certificate thumbprint is required");
  }

  if (claimedThumbprint && params.presentedClientCertThumbprint && claimedThumbprint !== params.presentedClientCertThumbprint) {
    throw new Error("mTLS certificate thumbprint mismatch");
  }

  return {
    claims: verified,
    scopes,
  };
}

export function getPresentedClientCertThumbprint(headers: Headers): string | null {
  const direct = headers.get(getClientCertHeaderName());
  if (direct && direct.trim()) {
    return direct.trim();
  }

  // Common proxy header fallback (parse best-effort; deployments may transform this differently).
  const forwarded = headers.get("x-forwarded-client-cert");
  if (forwarded && forwarded.trim()) {
    return forwarded.trim();
  }

  return null;
}

export function verifyServiceTokenFromRequest(params: {
  request: Request;
  audience: string | string[];
  requiredScopes?: string[];
}): VerifiedServiceIdentity {
  const authHeader = params.request.headers.get("authorization");
  const headerToken = params.request.headers.get("x-service-token");
  const token = extractServiceToken(authHeader, headerToken);

  if (!token) {
    throw new Error("Service token missing");
  }

  return verifyServiceToken({
    token,
    audience: params.audience,
    requiredScopes: params.requiredScopes,
    presentedClientCertThumbprint: getPresentedClientCertThumbprint(params.request.headers),
  });
}

export function parseServiceTokenFromNodeHeaders(params: {
  authorizationHeader: string | undefined;
  serviceTokenHeader: string | undefined;
}): string | null {
  return extractServiceToken(params.authorizationHeader || null, params.serviceTokenHeader || null);
}

export function getPresentedClientCertThumbprintFromNodeHeaders(headers: Record<string, unknown>): string | null {
  const primaryHeader = getClientCertHeaderName();
  const rawPrimary = headers[primaryHeader] || headers[primaryHeader.toLowerCase()];
  if (typeof rawPrimary === "string" && rawPrimary.trim()) {
    return rawPrimary.trim();
  }

  const forwarded = headers["x-forwarded-client-cert"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.trim();
  }

  return null;
}
