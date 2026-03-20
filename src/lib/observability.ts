type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  event: string;
  timestamp: string;
  service: string;
  environment: string;
  data?: Record<string, unknown>;
};

function normalizeError(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}

function normalizeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    output[key] = normalizeError(value);
  }

  return output;
}

export function logEvent(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const payload: LogPayload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    service: process.env.OBS_SERVICE_NAME || "meetflow-next-api",
    environment: process.env.NODE_ENV || "development",
    data: normalizeData(data),
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}

export function logInfo(event: string, data?: Record<string, unknown>): void {
  logEvent("info", event, data);
}

export function logWarn(event: string, data?: Record<string, unknown>): void {
  logEvent("warn", event, data);
}

export function logError(event: string, data?: Record<string, unknown>): void {
  logEvent("error", event, data);
}

export function uptimeSeconds(): number {
  return Math.round(process.uptime());
}

export function processStats() {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: uptimeSeconds(),
    rssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    externalBytes: mem.external,
    pid: process.pid,
    nodeVersion: process.version,
  };
}
