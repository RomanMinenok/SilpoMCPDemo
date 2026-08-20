import test from "node:test";
import assert from "node:assert/strict";
import { aggregateProducts, summarizeOrders } from "../src/lib/analytics.js";

const orders = [
  { id: "a", createdAt: "2026-01-02", store: "A", total: 100, discount: 10, bonuses: 1, receiptUrl: "#", products: [
    { id: 1, name: "Сир", unit: "шт", quantity: 2, price: 20, weighted: false, excluded: false },
    { id: 9, name: "Пакет", unit: "шт", quantity: 1, price: 1, weighted: false, excluded: true }
  ] },
  { id: "b", createdAt: "2026-02-02", store: "A", total: 80, discount: 5, bonuses: 2, receiptUrl: "#", products: [
    { id: 1, name: "Сир", unit: "шт", quantity: 1, price: 30, weighted: false, excluded: false },
    { id: 2, name: "Хліб", unit: "шт", quantity: 5, price: 10, weighted: false, excluded: false }
  ] }
];

test("ranks by receipt frequency before quantity", () => {
  const products = aggregateProducts(orders);
  assert.equal(products[0].name, "Сир");
  assert.equal(products[0].purchaseCount, 2);
  assert.equal(products[0].quantityTotal, 3);
});

test("uses the most recent observed price regardless of input order", () => {
  const products = aggregateProducts([...orders].reverse());
  assert.equal(products[0].lastPrice, 30);
  assert.equal(products[0].lastPurchasedAt, "2026-02-02");
});

test("excludes bags from product analytics", () => {
  assert.equal(aggregateProducts(orders).some((item) => item.name === "Пакет"), false);
});

test("summarizes order money and visible line items", () => {
  assert.deepEqual(summarizeOrders(orders), { orders: 2, spent: 180, saved: 15, bonuses: 3, items: 3 });
});
