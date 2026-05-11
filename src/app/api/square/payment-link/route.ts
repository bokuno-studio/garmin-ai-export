import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SQUARE_API_VERSION = "2026-01-22";
const PRODUCT_NAME = "Garmin AI Export";
const PRODUCT_PRICE = 300;
const PRODUCT_CURRENCY = "JPY";
const PRODUCTION_REDIRECT_URL = "https://garmin-ai-export.vercel.app?paid=true";
const PRODUCTION_ORIGIN = new URL(PRODUCTION_REDIRECT_URL).origin;
const PAYMENT_LINK_INTENT = "create_payment_link";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_BUCKET_LIMIT = 10_000;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export async function POST(request: NextRequest) {
  const originError = validateRequestOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimit = checkRateLimit(getRateLimitKey(request));
  if (!rateLimit.allowed) {
    return json(
      { error: "Too many payment link requests. Try again later." },
      429,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    );
  }

  const intent = await getPaymentIntent(request);
  if (intent !== PAYMENT_LINK_INTENT) {
    return json({ error: "Invalid payment link request." }, 400);
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  if (!accessToken || !locationId) {
    return json({ error: "Square payment settings are not configured." }, 500);
  }

  try {
    const squareResponse = await fetch(
      `${getSquareApiBaseUrl()}/v2/online-checkout/payment-links`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Square-Version": SQUARE_API_VERSION,
        },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          quick_pay: {
            name: PRODUCT_NAME,
            price_money: {
              amount: PRODUCT_PRICE,
              currency: PRODUCT_CURRENCY,
            },
            location_id: locationId,
          },
          checkout_options: {
            allow_tipping: false,
            redirect_url: getRedirectUrl(request),
          },
          description: "Download gate for Garmin AI Export.",
          payment_note: PRODUCT_NAME,
        }),
        cache: "no-store",
      },
    );

    const payload: unknown = await squareResponse.json().catch(() => null);

    if (!squareResponse.ok) {
      console.error(
        "Square payment link creation failed",
        JSON.stringify(payload),
      );
      return json(
        { error: "Square payment link creation failed." },
        squareResponse.status,
      );
    }

    const url = getPaymentLinkUrl(payload);
    if (!url) {
      return json({ error: "Square did not return a payment link URL." }, 502);
    }

    return json({ url }, 200);
  } catch (error) {
    console.error("Unable to create a Square payment link", error);
    return json({ error: "Unable to create a Square checkout link." }, 502);
  }
}

function getSquareApiBaseUrl(): string {
  if (process.env.SQUARE_API_BASE_URL) {
    return process.env.SQUARE_API_BASE_URL.replace(/\/$/, "");
  }

  return process.env.SQUARE_ENVIRONMENT?.toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function getRedirectUrl(request: NextRequest): string {
  if (process.env.SQUARE_REDIRECT_URL) {
    return process.env.SQUARE_REDIRECT_URL;
  }

  if (process.env.NODE_ENV === "development") {
    return new URL("/?paid=true", request.nextUrl.origin).toString();
  }

  return PRODUCTION_REDIRECT_URL;
}

function getPaymentLinkUrl(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.payment_link)) {
    return null;
  }

  return typeof payload.payment_link.url === "string"
    ? payload.payment_link.url
    : null;
}

async function getPaymentIntent(request: NextRequest): Promise<string | null> {
  const payload = (await request.json().catch(() => null)) as unknown;
  return isRecord(payload) && typeof payload.intent === "string"
    ? payload.intent
    : null;
}

function validateRequestOrigin(request: NextRequest): NextResponse | null {
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    return json({ error: "Payment link requests require a browser origin." }, 403);
  }

  if (!getAllowedOrigins(request).has(requestOrigin)) {
    return json({ error: "Payment link requests must come from this site." }, 403);
  }

  return null;
}

function getRequestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

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

  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  if (
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview"
  ) {
    origins.add(request.nextUrl.origin);
  }

  return origins;
}

function getRateLimitKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",").at(0)?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  return `payment-link:${ip}`;
}

function checkRateLimit(key: string):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneRateLimitBuckets(now);
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
}

function pruneRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size < RATE_LIMIT_BUCKET_LIMIT) {
    return;
  }

  rateLimitBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  });
}

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...headers,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
