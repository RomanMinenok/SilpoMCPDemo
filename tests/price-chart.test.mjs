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
  assert.equal((chart.match(/data-price-value-label/g) || []).length, 3);
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

test("keeps every purchase point while limiting price labels to twelve", () => {
  const chart = renderPriceHistoryChart([
    { createdAt: "2026-01-01T12:00:00Z", price: 10 },
    { createdAt: "2026-01-02T12:00:00Z", price: 20 },
    { createdAt: "2026-01-03T12:00:00Z", price: 15 },
    { createdAt: "2026-01-04T12:00:00Z", price: 25 },
    { createdAt: "2026-01-05T12:00:00Z", price: 19 },
    { createdAt: "2026-01-06T12:00:00Z", price: 30 },
    { createdAt: "2026-01-07T12:00:00Z", price: 22 },
    { createdAt: "2026-01-08T12:00:00Z", price: 35 }
  ]);

  assert.equal((chart.match(/data-price-point/g) || []).length, 8);
  assert.ok((chart.match(/data-price-value-label/g) || []).length <= 12);
  assert.ok((chart.match(/data-price-date/g) || []).length <= 12);
  assert.doesNotMatch(chart, /overflow-x: auto/);
});

test("removes the smallest price change before reducing a chart beyond twelve points", () => {
  const history = [100, 100.01, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 250]
    .map((price, index) => ({ createdAt: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00Z`, price }));
  const chart = renderPriceHistoryChart(history);

  const labels = [...chart.matchAll(/<g class="price-chart-value-label"[^>]*>[\s\S]*?<\/g>/g)].map((match) => match[0]).join("");

  assert.equal((chart.match(/data-price-point/g) || []).length, 15);
  assert.ok((chart.match(/data-price-value-label/g) || []).length <= 12);
  assert.doesNotMatch(labels, /100,01 ₴/);
  assert.match(labels, /100 ₴/);
  assert.match(labels, /250 ₴/);
});

test("hides adjacent mobile markers while keeping every purchase in the chart", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 360 } };
  const history = Array.from({ length: 24 }, (_, index) => ({
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    price: 50
  }));
  const chart = renderPriceHistoryChart(history);
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;

  assert.equal((chart.match(/data-price-point/g) || []).length, 24);
  assert.ok((chart.match(/data-price-value-label/g) || []).length < 12);
  assert.ok((chart.match(/price-history-point is-marker-hidden/g) || []).length > 0);
  assert.equal((chart.match(/price-history-point-halo/g) || []).length, 2);
  assert.match(chart, /viewBox="0 0 328 370"/);
});

test("hides a dense twenty-three-point mobile run at the observed viewport width", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 591 } };
  const history = Array.from({ length: 23 }, (_, index) => ({
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    price: 55.49
  }));
  const chart = renderPriceHistoryChart(history);
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;

  assert.equal((chart.match(/price-history-point-halo/g) || []).length, 2);
});

test("keeps un-crowded markers visible outside the mobile layout", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    price: 50
  }));
  const chart = renderPriceHistoryChart(history);

  assert.equal((chart.match(/price-history-point-halo/g) || []).length, 12);
});

test("hides crowded straight-line markers in a narrow desktop window", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 1100 } };
  const history = Array.from({ length: 24 }, (_, index) => ({
    createdAt: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    price: 50
  }));
  const chart = renderPriceHistoryChart(history);
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;

  assert.equal((chart.match(/price-history-point-halo/g) || []).length, 2);
});

test("keeps only plateau boundaries when a dense horizontal run changes direction", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 1100 } };
  const history = [50, 55, ...Array(8).fill(60), 42, ...Array(10).fill(48), 40, 50]
    .map((price, index) => ({ createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00Z`, price }));
  const chart = renderPriceHistoryChart(history);
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;

  assert.match(chart, /<g class="price-history-point is-marker-hidden" data-price-point data-point-index="3"/);
  assert.match(chart, /<g class="price-history-point" data-price-point data-point-index="2"/);
  assert.match(chart, /<g class="price-history-point" data-price-point data-point-index="9"/);
});

test("keeps mobile price turns visible before nearby straight-line markers", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { documentElement: { clientWidth: 360 } };
  const history = Array.from({ length: 24 }, (_, index) => ({
    createdAt: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    price: index === 10 ? 65 : 50
  }));
  const chart = renderPriceHistoryChart(history);
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;

  assert.match(chart, /<g class="price-history-point" data-price-point data-point-index="10"/);
  assert.match(chart, /<g class="price-history-point is-marker-hidden" data-price-point data-point-index="9"/);
});

test("labels the price axis with the purchase unit", () => {
  const byWeight = renderPriceHistoryChart([{ createdAt: "2026-02-14T12:00:00Z", price: 56.25, unit: "кг" }]);
  const byPiece = renderPriceHistoryChart([{ createdAt: "2026-02-14T12:00:00Z", price: 56.25, unit: "шт" }]);

  assert.match(byWeight, /data-price-axis-unit[^>]*>ЦІНА, ₴\/КГ/);
  assert.match(byPiece, /data-price-axis-unit[^>]*>ЦІНА, ₴\/ШТ\./);
});
