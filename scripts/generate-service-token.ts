import { signServiceToken } from "../src/lib/serviceIdentity";

function main() {
  const audience = process.env.SERVICE_TOKEN_AUDIENCE || "next-api";
  const service = process.env.SERVICE_TOKEN_SERVICE || "local-smoke";
  const scopes = (process.env.SERVICE_TOKEN_SCOPES || "meetings:read meetings:write internal:read")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  const workspaceId = process.env.SERVICE_TOKEN_WORKSPACE_ID || undefined;
  const expiresInSeconds = Number(process.env.SERVICE_TOKEN_TTL_SECONDS || "300");
  const mtlsCertThumbprint = process.env.SERVICE_TOKEN_MTLS_THUMBPRINT || undefined;

  const token = signServiceToken({
    service,
    audience,
    scopes,
    workspaceId,
    expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : 300,
    mtlsCertThumbprint,
  });

  process.stdout.write(token);
}

main();
