const priceFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });
const chartDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

export function renderPriceHistoryChart(history = []) {
  const observations = history
    .map((item, index) => ({
      createdAt: item?.createdAt,
      price: Number(item?.price),
      unit: item?.unit,
      timestamp: new Date(item?.createdAt).getTime(),
      index
    }))
    .filter((item) => Number.isFinite(item.price) && Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);

  if (!observations.length) return "";
  const layout = chartLayout();

  return `
    <section class="price-chart-section" aria-labelledby="price-chart-title">
      <div class="section-heading compact">
        <div><p class="eyebrow">Ціна у ваших чеках</p><h2 id="price-chart-title">Динаміка ціни</h2></div>
        <p>Лінія показує всі покупки. До 12 підписів виділяють зміни ціни, а за нестачі місця лишаються найпомітніші.</p>
      </div>
      <div class="price-chart-scroll" role="region" aria-label="Графік зміни ціни товару за датами покупок">
        ${renderChartSvg(observations, layout)}
      </div>
    </section>`;
}

function renderChartSvg(observations, { width, dimensions, labelFontSize, isMobile }) {
  const plotWidth = width - dimensions.left - dimensions.right;
  const plotHeight = dimensions.height - dimensions.top - dimensions.bottom;
  const prices = observations.map((item) => item.price);
  const observedMin = Math.min(...prices);
  const observedMax = Math.max(...prices);
  const padding = Math.max((observedMax - observedMin) * 0.18, observedMax * 0.08, 5);
  const domainMin = Math.max(0, observedMin - padding);
  const domainMax = observedMax + padding;
  const xFor = (index) => observations.length === 1
    ? dimensions.left + plotWidth / 2
    : dimensions.left + index * plotWidth / (observations.length - 1);
  const yFor = (price) => dimensions.top + (domainMax - price) / (domainMax - domainMin) * plotHeight;
  const points = observations.map((item, index) => ({ ...item, seriesIndex: index, x: xFor(index), y: yFor(item.price) }));
  const markerIndexes = selectMarkerIndexes(points, isMobile);
  const ticks = Array.from({ length: 5 }, (_, index) => domainMin + (domainMax - domainMin) * index / 4);
  const path = createMonotonePath(points);
  const priceUnit = priceAxisUnit(observations);
  const priceLabels = selectPriceLabels(points, dimensions, labelFontSize);
  const dateLabelIndexes = selectDateLabelIndexes(points.length, priceLabels.map((label) => label.index));

  return `
        <svg class="price-history-chart" viewBox="0 0 ${width} ${dimensions.height}" width="100%" height="${dimensions.height}" role="img" aria-labelledby="price-chart-title price-chart-description">
          <desc id="price-chart-description">Графік містить усі ${points.length} ${ukrainianPurchaseWord(points.length)} з вашої історії покупок. Підписи показують до 12 ключових змін ціни.</desc>
          <rect class="price-chart-frame" x="${dimensions.left}" y="${dimensions.top}" width="${plotWidth}" height="${plotHeight}"></rect>
          <text class="price-chart-axis-title" data-price-axis-unit x="${dimensions.left}" y="24">ЦІНА, ₴/${escapeHtml(priceUnit)}</text>
          ${ticks.map((value) => `
            <g class="price-chart-gridline">
              <line x1="${dimensions.left}" x2="${width - dimensions.right}" y1="${yFor(value)}" y2="${yFor(value)}"></line>
              <text x="${dimensions.left - 14}" y="${yFor(value) + 4}" text-anchor="end">${escapeHtml(formatPrice(value))}</text>
            </g>`).join("")}
          <path class="price-history-line-underlay" d="${path}"></path>
          <path class="price-history-line" d="${path}"></path>
          <g class="price-history-points">
            ${points.map((point) => {
              const pointLabel = `${formatChartDate(point.createdAt)}: ${formatPrice(point.price)}`;
              const showMarker = markerIndexes.has(point.seriesIndex);
              const marker = showMarker
                ? `<circle class="price-history-point-halo" cx="${point.x}" cy="${point.y}" r="9"></circle><circle class="price-history-point-dot" cx="${point.x}" cy="${point.y}" r="4.5"></circle>`
                : "";
              return `<g class="price-history-point${showMarker ? "" : " is-marker-hidden"}" data-price-point data-point-index="${point.seriesIndex}" aria-label="${escapeHtml(pointLabel)}"><title>${escapeHtml(pointLabel)}</title>${marker}</g>`;
            }).join("")}
          </g>
          <g class="price-chart-value-labels">
            ${priceLabels.map((label) => `
              <g class="price-chart-value-label" data-price-value-label data-price-label-kind="${label.kind}">
                <line x1="${label.point.x}" x2="${label.point.x}" y1="${label.lineStartY}" y2="${label.lineEndY}"></line>
                <rect x="${label.left}" y="${label.top}" width="${label.width}" height="${label.height}"></rect>
                <text x="${label.point.x}" y="${label.baseline}" text-anchor="middle">${escapeHtml(label.text)}</text>
              </g>`).join("")}
          </g>
          <line class="price-chart-axis" x1="${dimensions.left}" x2="${width - dimensions.right}" y1="${dimensions.top + plotHeight}" y2="${dimensions.top + plotHeight}"></line>
          ${dateLabelIndexes.map((index) => {
            const point = points[index];
            return `
            <g class="price-chart-date-tick" data-price-date>
              <line x1="${point.x}" x2="${point.x}" y1="${dimensions.top + plotHeight}" y2="${dimensions.top + plotHeight + 7}"></line>
              <text x="${point.x}" y="${dimensions.top + plotHeight + 22}" transform="rotate(48 ${point.x} ${dimensions.top + plotHeight + 22})" text-anchor="start">${escapeHtml(formatChartDate(point.createdAt))}</text>
            </g>`;
          }).join("")}
          <text class="price-chart-axis-title price-chart-x-axis-title" x="${dimensions.left + plotWidth / 2}" y="${dimensions.height - 12}" text-anchor="middle">ДАТА ПОКУПКИ</text>
        </svg>`;
}

function selectMarkerIndexes(points, isMobile) {
  const minimumDistance = isMobile ? 32 : 48;
  const candidates = points
    .map((point, index) => ({ point, index, priority: markerPriority(points, index) }))
    .sort((first, second) => second.priority - first.priority || first.index - second.index);
  const selected = [];

  for (const candidate of candidates) {
    if (candidate.priority === 1 && isAdjacentToAnotherPoint(points, candidate.index, minimumDistance)) continue;
    const overlapsVisibleMarker = selected.some((point) => Math.hypot(point.x - candidate.point.x, point.y - candidate.point.y) < minimumDistance);
    if (!overlapsVisibleMarker) selected.push(candidate.point);
  }

  return new Set(selected.map((point) => point.seriesIndex));
}

function isAdjacentToAnotherPoint(points, index, minimumDistance) {
  return [points[index - 1], points[index + 1]]
    .filter(Boolean)
    .some((point) => Math.hypot(point.x - points[index].x, point.y - points[index].y) < minimumDistance);
}

function markerPriority(points, index) {
  if (isPriceTurn(points, index)) return 3;
  if (index === 0 || index === points.length - 1) return 2;
  return 1;
}

function isPriceTurn(points, index) {
  if (index === 0 || index === points.length - 1) return false;
  const currentPrice = points[index].price;
  const touchesPriceChange = points[index - 1].price !== currentPrice || points[index + 1].price !== currentPrice;
  if (!touchesPriceChange) return false;
  const previous = findDifferentPrice(points, index, -1, currentPrice);
  const next = findDifferentPrice(points, index, 1, currentPrice);
  if (!previous || !next) return false;

  return (currentPrice - previous.price) * (next.price - currentPrice) < 0;
}

function findDifferentPrice(points, startIndex, step, price) {
  for (let index = startIndex + step; index >= 0 && index < points.length; index += step) {
    if (points[index].price !== price) return points[index];
  }
  return null;
}

function chartLayout() {
  const viewportWidth = typeof document === "undefined" ? 1200 : document.documentElement.clientWidth;
  const rootFontSize = typeof window === "undefined" ? 16 : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const isMobile = viewportWidth <= 680;
  const width = isMobile
    ? Math.max(240, viewportWidth - 32)
    : Math.min(1420, Math.max(720, viewportWidth - 72));
  const labelFontSize = Math.min(rootFontSize * .9375, Math.max(rootFontSize * .8125, rootFontSize * .75 + viewportWidth * .0035));
  return {
    width,
    labelFontSize,
    isMobile,
    dimensions: isMobile
      ? { top: 60, right: 16, bottom: 122, left: 64, height: 370 }
      : { top: 66, right: 32, bottom: 92, left: 98, height: 390 }
  };
}

function selectPriceLabels(points, dimensions, fontSize) {
  const selected = [...points];
  const protectedIndexes = new Set([
    points[0].index,
    points.at(-1).index,
    points[findPriceIndex(points, Math.min(...points.map((item) => item.price)))].index,
    points[findPriceIndex(points, Math.max(...points.map((item) => item.price)))].index
  ]);

  while (selected.length > 12) removeLeastSignificantLabel(selected, protectedIndexes);

  while (selected.length > 2) {
    const labels = createPriceLabels(selected, dimensions, fontSize);
    const collisions = findOverlappingLabelIndexes(labels);
    if (!collisions.size || !removeLeastSignificantLabel(selected, protectedIndexes, collisions)) break;
  }

  return createPriceLabels(selected, dimensions, fontSize);
}

function removeLeastSignificantLabel(selected, protectedIndexes, allowedIndexes) {
  const candidates = selected
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !protectedIndexes.has(item.index))
    .filter(({ item }) => !allowedIndexes || allowedIndexes.has(item.index));
  const removable = candidates.length ? candidates : selected.map((item, index) => ({ item, index }))
    .filter(({ item }) => !protectedIndexes.has(item.index));
  if (!removable.length) {
    const endpointIndexes = new Set([selected[0].index, selected.at(-1).index]);
    removable.push(...selected.map((item, index) => ({ item, index })).filter(({ item }) => !endpointIndexes.has(item.index)));
  }
  if (!removable.length) return false;

  removable.sort((a, b) => priceChangeAt(selected, a.index) - priceChangeAt(selected, b.index) || a.index - b.index);
  selected.splice(removable[0].index, 1);
  return true;
}

function priceChangeAt(points, index) {
  const before = points[index - 1];
  const after = points[index + 1];
  if (!before) return Math.abs(after.price - points[index].price);
  if (!after) return Math.abs(points[index].price - before.price);
  return Math.min(Math.abs(points[index].price - before.price), Math.abs(after.price - points[index].price));
}

function findOverlappingLabelIndexes(labels) {
  const collidingIndexes = new Set();
  for (let index = 0; index < labels.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < labels.length; nextIndex += 1) {
      const first = labels[index];
      const second = labels[nextIndex];
      if (first.left < second.right + 8 && first.right > second.left - 8 && first.top < second.bottom + 6 && first.bottom > second.top - 6) {
        collidingIndexes.add(first.point.index);
        collidingIndexes.add(second.point.index);
      }
    }
  }
  return collidingIndexes;
}

function createPriceLabels(points, dimensions, fontSize) {
  return points.map((point) => {
    const text = formatPrice(point.price);
    const width = estimateLabelWidth(text, fontSize);
    const height = fontSize + 7;
    const placeAbove = point.y - height - 9 >= dimensions.top;
    const top = placeAbove ? point.y - height - 9 : point.y + 9;
    return {
      kind: "value",
      index: point.seriesIndex,
      point,
      text,
      width,
      height,
      left: point.x - width / 2,
      right: point.x + width / 2,
      top,
      bottom: top + height,
      baseline: top + fontSize + 1,
      lineStartY: point.y + (placeAbove ? -8 : 8),
      lineEndY: placeAbove ? top + height : top - 4
    };
  });
}

function selectDateLabelIndexes(length, requiredIndexes) {
  const indexes = new Set([0, length - 1, ...requiredIndexes]);
  const limit = 6;
  for (let step = 1; indexes.size < limit && step < limit; step += 1) {
    indexes.add(Math.round(step * (length - 1) / limit));
  }
  return [...indexes].sort((a, b) => a - b).slice(0, limit);
}

function findPriceIndex(points, value) {
  return points.findIndex((point) => point.price === value);
}

function estimateLabelWidth(text, fontSize) {
  return Math.max(fontSize * 3.8, text.length * fontSize * .62 + 12);
}

function createMonotonePath(points) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  const tangents = points.map((point, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1);
    const previous = slopes[index - 1];
    const next = slopes[index];
    return previous * next <= 0 ? 0 : (previous + next) / 2;
  });

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const deltaX = point.x - previous.x;
    const controlOneX = previous.x + deltaX / 3;
    const controlOneY = previous.y + tangents[index] * deltaX / 3;
    const controlTwoX = point.x - deltaX / 3;
    const controlTwoY = point.y - tangents[index + 1] * deltaX / 3;
    return `${path} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function formatPrice(value) {
  return `${priceFormatter.format(value)} ₴`;
}

function formatChartDate(value) {
  return chartDateFormatter.format(new Date(value));
}

function priceAxisUnit(observations) {
  const unit = observations.find((item) => typeof item.unit === "string" && item.unit.trim())?.unit?.trim() || "шт.";
  const normalized = unit.toLocaleLowerCase("uk-UA").replaceAll(".", "");
  if (normalized === "кг" || normalized === "kg") return "КГ";
  if (normalized === "шт" || normalized === "pcs" || normalized === "pc") return "ШТ.";
  return unit.toLocaleUpperCase("uk-UA");
}

function ukrainianPurchaseWord(value) {
  const remainder = value % 10;
  const tens = value % 100;
  if (remainder === 1 && tens !== 11) return "покупку";
  if (remainder >= 2 && remainder <= 4 && (tens < 12 || tens > 14)) return "покупки";
  return "покупок";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
