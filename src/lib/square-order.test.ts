import { strict as assert } from "node:assert";
import test from "node:test";
import { isPaidSquareOrder } from "./square-order.ts";

const now = Date.parse("2026-07-16T05:36:00.000Z");
const locationId = "<SQUARE_LOCATION_ID>";

const capturedCardTender = {
  id: "B46jU7NR1b9dAtSQ6iAIgzDeirTZY",
  location_id: "<SQUARE_LOCATION_ID>",
  transaction_id: "wEmZJ8k6w9fmLOIQbwGJ5X5nm3OZY",
  created_at: "2026-07-16T05:35:02.923Z",
  note: "Garmin AI Export",
  amount_money: { amount: 300, currency: "JPY" },
  tip_money: { amount: 0, currency: "JPY" },
  type: "CARD",
  card_details: {
    status: "CAPTURED",
    card: { card_brand: "VISA", last_4: "2791", card_type: "DEBIT" },
    entry_method: "KEYED",
  },
  payment_id: "B46jU7NR1b9dAtSQ6iAIgzDeirTZY",
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      state: "OPEN",
      location_id: locationId,
      created_at: "2026-07-16T05:35:02.923Z",
      total_money: { amount: 300, currency: "JPY" },
      net_amount_due_money: { amount: 0, currency: "JPY" },
      tenders: [capturedCardTender],
      ...overrides,
    },
  };
}

test("accepts the captured, fully paid OPEN order from the real Square fixture", () => {
  assert.equal(isPaidSquareOrder(order(), locationId, now), true);
  assert.equal(
    isPaidSquareOrder(
      order({ total_money: { amount: 1200, currency: "JPY" } }),
      locationId,
      now,
    ),
    true,
  );
});

test("rejects orders with a remaining balance, wrong location, or expired age", () => {
  assert.equal(isPaidSquareOrder(order({ net_amount_due_money: { amount: 300, currency: "JPY" } }), locationId, now), false);
  assert.equal(isPaidSquareOrder(order({ location_id: "OTHER" }), locationId, now), false);
  assert.equal(isPaidSquareOrder(order({ created_at: "2026-07-15T05:35:02.922Z" }), locationId, now), false);
});

test("accepts non-card captured payment methods and rejects uncaptured cards", () => {
  assert.equal(
    isPaidSquareOrder(
      order({ tenders: [{ amount_money: { amount: 300, currency: "JPY" }, type: "CASH" }] }),
      locationId,
      now,
    ),
    true,
  );
  assert.equal(
    isPaidSquareOrder(
      order({
        tenders: [
          {
            amount_money: { amount: 300, currency: "JPY" },
            type: "CARD",
            card_details: { status: "PENDING" },
          },
        ],
      }),
      locationId,
      now,
    ),
    false,
  );
});
