import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRecentPurchases, sanitizeTopProducts } from "../src/lib/openrouter-commentary.js";

test("allows only top-product names and receipt frequencies for comic commentary", () => {
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

test("allows only recent purchase names and visible item counts for comic commentary", () => {
  const purchases = sanitizeRecentPurchases([
    { id: "private-order-id", name: "  Тестовий  чек  ", itemCount: 3.4, total: 999, store: "Private address" },
    { name: "Ще один чек", itemCount: -5, products: [{ name: "Private product" }] },
    { name: "", itemCount: 2 }
  ]);

  assert.deepEqual(purchases, [
    { name: "Тестовий чек", itemCount: 3 },
    { name: "Ще один чек", itemCount: 0 }
  ]);
  assert.equal(JSON.stringify(purchases).includes("private-order-id"), false);
  assert.equal(JSON.stringify(purchases).includes("Private address"), false);
});
