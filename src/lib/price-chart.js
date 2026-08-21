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

  const dimensions = { top: 48, right: 32, bottom: 104, left: 98, height: 390 };
  const width = Math.max(780, dimensions.left + dimensions.right + Math.max(1, observations.length - 1) * 96);
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
  const points = observations.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.price) }));
  const ticks = Array.from({ length: 5 }, (_, index) => domainMin + (domainMax - domainMin) * index / 4);
  const path = createMonotonePath(points);
  const priceUnit = priceAxisUnit(observations);

  return `
    <section class="price-chart-section" aria-labelledby="price-chart-title">
      <div class="section-heading compact">
        <div><p class="eyebrow">Ціна у ваших чеках</p><h2 id="price-chart-title">Динаміка ціни</h2></div>
        <p>Плавна лінія допомагає побачити тенденцію, а кожна точка — фактична ціна під час покупки.</p>
      </div>
      <div class="price-chart-scroll" tabindex="0" role="region" aria-label="Графік зміни ціни товару за датами покупок">
        <svg class="price-history-chart" viewBox="0 0 ${width} ${dimensions.height}" width="${width}" height="${dimensions.height}" role="img" aria-labelledby="price-chart-title price-chart-description">
          <desc id="price-chart-description">Графік містить ${points.length} ${ukrainianPurchaseWord(points.length)} з вашої історії покупок. Кожна точка показує ціну товару в дату покупки.</desc>
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
              return `<g class="price-history-point" data-price-point aria-label="${escapeHtml(pointLabel)}"><title>${escapeHtml(pointLabel)}</title><circle class="price-history-point-halo" cx="${point.x}" cy="${point.y}" r="9"></circle><circle class="price-history-point-dot" cx="${point.x}" cy="${point.y}" r="4.5"></circle></g>`;
            }).join("")}
          </g>
          <line class="price-chart-axis" x1="${dimensions.left}" x2="${width - dimensions.right}" y1="${dimensions.top + plotHeight}" y2="${dimensions.top + plotHeight}"></line>
          ${points.map((point) => `
            <g class="price-chart-date-tick" data-price-date>
              <line x1="${point.x}" x2="${point.x}" y1="${dimensions.top + plotHeight}" y2="${dimensions.top + plotHeight + 7}"></line>
              <text x="${point.x}" y="${dimensions.top + plotHeight + 22}" transform="rotate(48 ${point.x} ${dimensions.top + plotHeight + 22})" text-anchor="start">${escapeHtml(formatChartDate(point.createdAt))}</text>
            </g>`).join("")}
          <text class="price-chart-axis-title price-chart-x-axis-title" x="${dimensions.left + plotWidth / 2}" y="${dimensions.height - 12}" text-anchor="middle">ДАТА ПОКУПКИ</text>
        </svg>
      </div>
    </section>`;
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
