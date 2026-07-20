import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://garmin-ai-export.vercel.app";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_BUCKET_LIMIT = 10_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

export function validateRequestOrigin(request: NextRequest): NextResponse | null {
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    return json({ error: "Square requests require a browser origin." }, 403);
  }

  if (!getAllowedOrigins(request).has(requestOrigin)) {
    return json({ error: "Square requests must come from this site." }, 403);
  }

  return null;
}

export function checkRequestRateLimit(
  request: NextRequest,
  endpoint: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  return checkRateLimit(`${endpoint}:${getClientIp(request)}`);
}

export function getSquareApiBaseUrl(): string {
  if (process.env.SQUARE_API_BASE_URL) {
    return process.env.SQUARE_API_BASE_URL.replace(/\/$/, "");
  }

  return process.env.SQUARE_ENVIRONMENT?.toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function getRequestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([PRODUCTION_ORIGIN]);
  process.env.SQUARE_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach((origin) => origins.add(origin));

  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") {
    origins.add(request.nextUrl.origin);
  }

  return origins;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",").at(0)?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(key: string):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneRateLimitBuckets(now);
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  current.count += 1;
  return { allowed: true };
}

function pruneRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size < RATE_LIMIT_BUCKET_LIMIT) return;
  rateLimitBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  });
}
