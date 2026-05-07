import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SQUARE_API_VERSION = "2026-01-22";
const PRODUCT_NAME = "Garmin AI Export";
const PRODUCT_PRICE = 1200;
const PRODUCT_CURRENCY = "JPY";
const PRODUCTION_REDIRECT_URL = "https://garmin-ai-export.vercel.app?paid=true";

export async function POST(request: NextRequest) {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  if (!accessToken || !locationId) {
    return NextResponse.json(
      { error: "Square payment settings are not configured." },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: getSquareErrorMessage(payload) },
        { status: squareResponse.status },
      );
    }

    const url = getPaymentLinkUrl(payload);
    if (!url) {
      return NextResponse.json(
        { error: "Square did not return a payment link URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create a Square payment link.",
      },
      { status: 502 },
    );
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

function getSquareErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) {
    return "Square payment link creation failed.";
  }

  const firstError = payload.errors.find(isRecord);
  if (!firstError) {
    return "Square payment link creation failed.";
  }

  if (typeof firstError.detail === "string") {
    return firstError.detail;
  }

  return typeof firstError.code === "string"
    ? firstError.code
    : "Square payment link creation failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
