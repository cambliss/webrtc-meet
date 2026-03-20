import { getDbPool } from "@/src/lib/db";

type CounterBucket = {
  value: number;
  resetAtMs: number;
};

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
};

const buckets = new Map<string, CounterBucket>();
const MAX_BUCKETS = 20000;

function cleanupBuckets(nowMs: number) {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      buckets.delete(key);
    }
  }
}

function normalizeForwardedIp(rawHeader: string | null): string {
  if (!rawHeader) {
    return "unknown";
  }

  const first = rawHeader.split(",")[0]?.trim();
  if (!first) {
    return "unknown";
  }

  return first.slice(0, 120);
}

export function getRequestIp(request: Request): string {
  return (
    normalizeForwardedIp(request.headers.get("x-forwarded-for")) ||
    request.headers.get("x-real-ip")?.slice(0, 120) ||
    "unknown"
  );
}

export function buildRateLimitKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
}

function getRateLimitStore(): "memory" | "postgres" {
  return String(process.env.RATE_LIMIT_STORE || "memory").toLowerCase() === "postgres"
    ? "postgres"
    : "memory";
}

async function checkRateLimitPostgres(params: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  weight?: number;
}): Promise<RateLimitDecision> {
  const nowMs = Date.now();
  const safeLimit = Math.max(1, params.limit);
  const safeWindowMs = Math.max(1000, params.windowMs);
  const weight = Math.max(1, params.weight || 1);

  const windowStartMs = Math.floor(nowMs / safeWindowMs) * safeWindowMs;
  const windowStartIso = new Date(windowStartMs).toISOString();
  const resetAtMs = windowStartMs + safeWindowMs;

  const pool = getDbPool();
  const result = await pool.query<{ current_count: number }>(
    `
    INSERT INTO api_rate_limit_counters (
      scope,
      actor_key,
      window_start,
      count,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3::timestamptz, $4, NOW(), NOW())
    ON CONFLICT (scope, actor_key, window_start)
    DO UPDATE SET
      count = api_rate_limit_counters.count + EXCLUDED.count,
      updated_at = NOW()
    RETURNING count AS current_count
    `,
    [params.scope, params.key, windowStartIso, weight],
  );

  const currentCount = Number(result.rows[0]?.current_count || 0);
  const allowed = currentCount <= safeLimit;

  return {
    allowed,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
    remaining: Math.max(0, safeLimit - currentCount),
    limit: safeLimit,
  };
}

function checkRateLimitMemory(params: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  weight?: number;
}): RateLimitDecision {
  const nowMs = Date.now();
  const safeLimit = Math.max(1, params.limit);
  const safeWindowMs = Math.max(1000, params.windowMs);
  const weight = Math.max(1, params.weight || 1);

  cleanupBuckets(nowMs);

  const mapKey = `${params.scope}:${params.key}`;
  const existing = buckets.get(mapKey);

  if (!existing || existing.resetAtMs <= nowMs) {
    const resetAtMs = nowMs + safeWindowMs;
    const startingValue = Math.min(weight, safeLimit);
    buckets.set(mapKey, {
      value: startingValue,
      resetAtMs,
    });

    return {
      allowed: weight <= safeLimit,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
      remaining: Math.max(0, safeLimit - startingValue),
      limit: safeLimit,
    };
  }

  if (existing.value + weight > safeLimit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
      remaining: Math.max(0, safeLimit - existing.value),
      limit: safeLimit,
    };
  }

  existing.value += weight;
  buckets.set(mapKey, existing);

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
    remaining: Math.max(0, safeLimit - existing.value),
    limit: safeLimit,
  };
}

export async function checkRateLimit(params: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  weight?: number;
}): Promise<RateLimitDecision> {
  if (getRateLimitStore() === "postgres") {
    return checkRateLimitPostgres(params);
  }

  return checkRateLimitMemory(params);
}
