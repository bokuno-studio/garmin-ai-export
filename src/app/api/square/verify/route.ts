import { type NextRequest } from "next/server";
import { isPaidSquareOrder } from "@/lib/square-order";
import {
  checkRequestRateLimit,
  getSquareApiBaseUrl,
  json,
  validateRequestOrigin,
} from "../shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SQUARE_API_VERSION = "2026-01-22";

export async function POST(request: NextRequest) {
  const originError = validateRequestOrigin(request);
  if (originError) return originError;

  const rateLimit = checkRequestRateLimit(request, "verify");
  if (!rateLimit.allowed) {
    return json({ error: "Too many verification requests. Try again later." }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const orderId = await getOrderId(request);
  if (!orderId) return json({ error: "Invalid payment verification request." }, 400);

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!accessToken || !locationId) return json({ error: "Square payment settings are not configured." }, 500);

  try {
    const squareResponse = await fetch(`${getSquareApiBaseUrl()}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Square-Version": SQUARE_API_VERSION },
      cache: "no-store",
    });
    const payload: unknown = await squareResponse.json().catch(() => null);

    if (!squareResponse.ok) {
      console.error("Square order verification failed", JSON.stringify(payload));
      return json({ error: "Unable to verify Square payment." }, squareResponse.status);
    }

    return json({ ok: isPaidSquareOrder(payload, locationId) }, 200);
  } catch (error) {
    console.error("Unable to verify Square payment", error);
    return json({ error: "Unable to verify Square payment." }, 502);
  }
}

async function getOrderId(request: NextRequest): Promise<string | null> {
  const payload = (await request.json().catch(() => null)) as unknown;
  if (typeof payload !== "object" || payload === null) return null;
  const orderId = (payload as Record<string, unknown>).orderId;
  return typeof orderId === "string" && orderId.length > 0 ? orderId : null;
}
