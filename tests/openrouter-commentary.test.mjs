import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReceiptItems, sanitizeTopProducts } from "../src/lib/openrouter-commentary.js";

test("allows only top-product names and receipt frequencies for critic commentary", () => {
  const products = sanitizeTopProducts([
    { id: "private-product-id", name: "  Синтетичне  молоко  ", purchaseCount: 3, lastPrice: 99, image: "https://private.example/image" },
    { name: "Синтетичний хліб", purchaseCount: 2.4, history: [{ createdAt: "2026-01-01" }] },
    { name: "", purchaseCount: 6 },
    ...Array.from({ length: 10 }, (_, index) => ({ name: `Тест ${index}`, purchaseCount: index }))
  ]);

  assert.equal(products.length, 10);
  assert.deepEqual(products[0], { name: "Синтетичне молоко", purchaseCount: 3 });
  assert.deepEqual(products[1], { name: "Синтетичний хліб", purchaseCount: 2 });
  assert.equal(JSON.stringify(products).includes("private-product-id"), false);
  assert.equal(JSON.stringify(products).includes("private.example"), false);
});

test("rejects a non-array commentary payload", () => {
  assert.deepEqual(sanitizeTopProducts({ name: "Синтетичний товар" }), []);
});

test("allows only receipt item names and quantities for critic commentary", () => {
  const items = sanitizeReceiptItems([
    { id: "private-item-id", name: "  Тестове  молоко  ", quantity: 3.4, price: 999, image: "https://private.example/image" },
    { name: "Тестовий хліб", quantity: -5, receipt: { store: "Private address" } },
    { name: "", quantity: 2 }
  ]);

  assert.deepEqual(items, [
    { name: "Тестове молоко", quantity: 3.4 },
    { name: "Тестовий хліб", quantity: 0 }
  ]);
  assert.equal(JSON.stringify(items).includes("private-item-id"), false);
  assert.equal(JSON.stringify(items).includes("Private address"), false);
});
