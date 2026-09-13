import { type NextRequest } from "next/server";
import { DOWNLOAD_FEE_YEN } from "@/lib/square-order";
import {
  checkRequestRateLimit,
  getSquareApiBaseUrl,
  json,
  validateRequestOrigin,
} from "../shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SQUARE_API_VERSION = "2026-01-22";
const PRODUCT_NAME = "Garmin AI Export";
const PRODUCT_CURRENCY = "JPY";
const PRODUCTION_REDIRECT_URL = "https://garmin-ai-export.vercel.app";
const PAYMENT_LINK_INTENT = "create_payment_link";

export async function POST(request: NextRequest) {
  const originError = validateRequestOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimit = checkRequestRateLimit(request, "payment-link");
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
              amount: DOWNLOAD_FEE_YEN,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
