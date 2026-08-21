import test from "node:test";
import assert from "node:assert/strict";
import { renderPriceHistoryChart } from "../src/lib/price-chart.js";

test("renders each purchase as a dated point on a smooth price chart", () => {
  const chart = renderPriceHistoryChart([
    { createdAt: "2026-03-10T12:00:00Z", price: 52.5 },
    { createdAt: "2026-01-02T12:00:00Z", price: 48 },
    { createdAt: "2026-02-14T12:00:00Z", price: 56.25 }
  ]);

  assert.equal((chart.match(/data-price-point/g) || []).length, 3);
  assert.equal((chart.match(/data-price-date/g) || []).length, 3);
  assert.match(chart, /02\.01\.2026/);
  assert.match(chart, /14\.02\.2026/);
  assert.match(chart, /10\.03\.2026/);
  assert.match(chart, /price-history-line/);
  assert.match(chart, / C /);
});

test("renders a single price observation without a curve", () => {
  const chart = renderPriceHistoryChart([{ createdAt: "2026-02-14T12:00:00Z", price: 56.25 }]);

  assert.equal((chart.match(/data-price-point/g) || []).length, 1);
  assert.equal((chart.match(/data-price-date/g) || []).length, 1);
  assert.doesNotMatch(chart, / C /);
});

test("labels the price axis with the purchase unit", () => {
  const byWeight = renderPriceHistoryChart([{ createdAt: "2026-02-14T12:00:00Z", price: 56.25, unit: "кг" }]);
  const byPiece = renderPriceHistoryChart([{ createdAt: "2026-02-14T12:00:00Z", price: 56.25, unit: "шт" }]);

  assert.match(byWeight, /data-price-axis-unit[^>]*>ЦІНА, ₴\/КГ/);
  assert.match(byPiece, /data-price-axis-unit[^>]*>ЦІНА, ₴\/ШТ\./);
});
