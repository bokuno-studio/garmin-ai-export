export const DOWNLOAD_FEE_YEN = 900;
export const DOWNLOAD_FEE_LABEL = `¥${DOWNLOAD_FEE_YEN.toLocaleString("en-US")}`;
const ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isPaidSquareOrder(
  payload: unknown,
  locationId: string,
  now = Date.now(),
): boolean {
  if (!isRecord(payload) || !isRecord(payload.order)) return false;
  const order = payload.order;

  if (order.location_id !== locationId || !isRecentOrder(order.created_at, now)) {
    return false;
  }

  if (!hasMoney(order.total_money, DOWNLOAD_FEE_YEN, "JPY", true)) return false;
  if (!hasMoney(order.net_amount_due_money, 0, undefined)) return false;
  return Array.isArray(order.tenders) && order.tenders.some(isCapturedTender);
}

function isRecentOrder(value: unknown, now: number): boolean {
  if (typeof value !== "string") return false;
  const createdAt = Date.parse(value);
  return Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= ORDER_MAX_AGE_MS;
}

function hasMoney(
  value: unknown,
  amount: number,
  currency: string | undefined,
  minimum = false,
): boolean {
  return (
    isRecord(value) &&
    typeof value.amount === "number" &&
    (minimum ? value.amount >= amount : value.amount === amount) &&
    (currency === undefined || value.currency === currency)
  );
}

function isCapturedTender(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isRecord(value.amount_money) ||
    typeof value.amount_money.amount !== "number" ||
    value.amount_money.amount <= 0
  ) {
    return false;
  }
  if (!Object.hasOwn(value, "card_details")) return true;
  return isRecord(value.card_details) && value.card_details.status === "CAPTURED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
