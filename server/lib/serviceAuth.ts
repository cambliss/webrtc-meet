import type { NextFunction, Request, Response } from "express";

import {
  getPresentedClientCertThumbprintFromNodeHeaders,
  getServiceAuthMode,
  getSignalingInternalServiceAudience,
  parseServiceTokenFromNodeHeaders,
  verifyServiceToken,
  type VerifiedServiceIdentity,
} from "../../src/lib/serviceIdentity";

export type ServiceAuthedRequest = Request & {
  serviceIdentity?: VerifiedServiceIdentity;
};

export function requireServiceAuthExpress(params: {
  audience: string | string[];
  requiredScopes?: string[];
}) {
  return function serviceAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const mode = getServiceAuthMode();
    if (mode === "off") {
      next();
      return;
    }

    const token = parseServiceTokenFromNodeHeaders({
      authorizationHeader: typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
      serviceTokenHeader: typeof req.headers["x-service-token"] === "string" ? req.headers["x-service-token"] : undefined,
    });

    if (!token) {
      if (mode === "optional") {
        next();
        return;
      }

      res.status(401).json({ error: "Service token missing" });
      return;
    }

    try {
      const identity = verifyServiceToken({
        token,
        audience:
          params.audience === "signaling-internal" ? getSignalingInternalServiceAudience() : params.audience,
        requiredScopes: params.requiredScopes,
        presentedClientCertThumbprint: getPresentedClientCertThumbprintFromNodeHeaders(
          req.headers as unknown as Record<string, unknown>,
        ),
      });

      (req as ServiceAuthedRequest).serviceIdentity = identity;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid service token";
      res.status(401).json({ error: message });
    }
  };
}
