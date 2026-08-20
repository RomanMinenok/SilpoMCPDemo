import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOfflineOrders, normalizeOnlineOrders, withinPeriod } from "../src/lib/normalize-orders.js";

test("normalizes offline orders without account or receipt fields", () => {
  const [order] = normalizeOfflineOrders([{
    filId: 42,
    cityName: "Тестове місто",
    filialName: "Тестовий магазин",
    createdAt: "2026-02-03T10:00:00",
    sumReg: 150,
    sumDiscount: 20,
    accruedBalaBonusesSum: 2,
    receiptUrl: "https://private.example/receipt",
    products: [{
      lagerId: 7,
      name: "Тестовий товар",
      unit: "шт",
      quantity: 1,
      price: 150,
      image: null
    }]
  }]);

  assert.equal(order.products[0].id, "7");
  assert.equal("receiptUrl" in order, false);
  assert.equal(JSON.stringify(order).includes("private.example"), false);
});

test("excludes bags and removed online products", () => {
  const [order] = normalizeOnlineOrders([{
    orderId: "synthetic",
    status: "received",
    createdAt: "2026-03-01T10:00:00Z",
    amount: 12,
    discount: 0,
    products: [
      { id: "bag", name: "Пакет біорозкладний", quantity: 1, price: 2, removed: false },
      { id: "removed", name: "Видалений товар", quantity: 1, price: 10, removed: true }
    ]
  }]);

  assert.equal(order.products.length, 1);
  assert.equal(order.products[0].excluded, true);
});

test("keeps only orders inside the requested period", () => {
  const orders = [
    { createdAt: "2025-01-01T00:00:00Z" },
    { createdAt: "2026-01-01T00:00:00Z" }
  ];
  assert.equal(withinPeriod(orders, "2025-06-01T00:00:00Z", "2026-06-01T00:00:00Z").length, 1);
});
