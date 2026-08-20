import { aggregateProducts, filterOrdersByDays, filterOrdersByMonths, formatQuantity, summarizeOrders } from "./lib/analytics.js";

const app = document.querySelector("#app");
const money = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" });
let snapshot = null;
let products = [];
let topProducts = [];
let selectedPeriodKey = "12m";
let topProductsCommentary = "";
let commentaryState = "idle";
let commentaryProductsKey = "";
let recentPurchases = [];
let recentPurchasesOffset = 0;
let recentPurchasesHasMore = false;
let recentPurchasesWarnings = [];
let recentPurchasesState = "idle";
let recentPurchasesError = "";
let currentReceipt = null;
let receiptCommentary = "";
let receiptCommentaryState = "idle";
let receiptCommentaryKey = "";

const productPeriods = [
  { key: "7d", days: 7, label: "7 днів" },
  { key: "1m", months: 1, label: "1 міс." },
  { key: "2m", months: 2, label: "2 міс." },
  { key: "3m", months: 3, label: "3 міс." },
  { key: "6m", months: 6, label: "6 міс." },
  { key: "12m", months: 12, label: "1 рік" }
];

const icons = {
  arrow: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  back: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></svg>`,
  cart: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h2l2 10h9l2-7H7M9 19h.01M17 19h.01"/></svg>`,
  spark: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/></svg>`
};

function formatMoney(value) {
  return `${money.format(value)} ₴`;
}

function renderShell(content, detail = false, scrollToTop = true) {
  const activePage = location.hash.startsWith("#/recent-purchases") || location.hash.startsWith("#/receipt/")
    ? "recent-purchases"
    : "top-products";
  app.innerHTML = `
    <header class="site-header">
      <a class="wordmark" href="#/" aria-label="До Топ-10 товарів">
        <span class="wordmark-dot"></span><span>сільпо</span><em>/ зріз</em>
      </a>
      ${snapshot ? `
        <nav class="site-nav" aria-label="Основна навігація">
          <a href="#/"${activePage === "top-products" ? " aria-current=\"page\"" : ""}>Топ-10</a>
          <a href="#/recent-purchases"${activePage === "recent-purchases" ? " aria-current=\"page\"" : ""}>Останні покупки</a>
        </nav>
      ` : ""}
      <div class="header-actions">
        <div class="source-pill"><i></i>${snapshot?.source || "Silpo MCP"}</div>
        ${snapshot ? '<button class="text-button" data-logout>Вийти</button>' : ""}
      </div>
    </header>
    <main id="content" class="${detail ? "detail-main" : "dashboard-main"}">${content}</main>
    <footer>
      <span>${snapshot ? `Оновлено · ${date.format(new Date(snapshot.generatedAt))}` : "Персональна MCP-сесія"}</span>
      <span>Дані не записуються на диск</span>
    </footer>
  `;
  document.querySelector("[data-logout]")?.addEventListener("click", logout);
  if (scrollToTop) window.scrollTo({ top: 0, behavior: "instant" });
}

function renderLoading() {
  renderShell(`
    <section class="connection-screen">
      <div class="pulse-mark" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="eyebrow">Silpo MCP</p>
      <h1>Збираємо ваш<br><span>продуктовий рік</span></h1>
      <p>Завантажуємо покупки з вашої поточної авторизованої сесії.</p>
    </section>
  `);
}

function renderLogin(message = "") {
  snapshot = null;
  renderShell(`
    <section class="login-layout">
      <div class="login-copy reveal">
        <p class="eyebrow">Персональна статистика покупок</p>
        <h1>Ваші покупки.<br><span>Лише ваші.</span></h1>
        <p>Увійдіть у власний акаунт Сільпо. Ми завантажимо історію через Silpo MCP, порахуємо топ-10 і триматимемо дані тільки в пам’яті локального процесу.</p>
        ${message ? `<div class="error-note" role="alert">${escapeHtml(message)}</div>` : ""}
        <button class="primary-button" data-login>Увійти через Сільпо ${icons.arrow}</button>
        <small class="privacy-note">Без локальних файлів · без бази даних · токени HttpOnly</small>
      </div>
      <div class="privacy-receipt reveal" style="--delay:100ms">
        <span class="privacy-icon">◌</span>
        <p class="eyebrow">Приватність за замовчуванням</p>
        <h2>Репозиторій порожній.<br>Ваші дані — ні.</h2>
        <ul>
          <li><span>01</span> OAuth для кожного користувача</li>
          <li><span>02</span> Дані існують лише під час сесії</li>
          <li><span>03</span> Вихід очищає токени й історію</li>
        </ul>
      </div>
    </section>
  `);
  document.querySelector("[data-login]")?.addEventListener("click", login);
}

function renderDashboard(scrollToTop = true) {
  if (!snapshot.orders.length) return renderEmpty();
  const selectedPeriod = productPeriods.find((period) => period.key === selectedPeriodKey) || productPeriods.at(-1);
  const filteredOrders = selectedPeriod.days
    ? filterOrdersByDays(snapshot.orders, selectedPeriod.days, snapshot.periodEnd)
    : filterOrdersByMonths(snapshot.orders, selectedPeriod.months, snapshot.periodEnd);
  const selectedSummary = summarizeOrders(filteredOrders);
  products = aggregateProducts(filteredOrders);
  topProducts = products.slice(0, 10);
  resetCommentaryFor(topProducts);
  const maxPurchases = topProducts[0]?.purchaseCount || 1;
  const productRows = topProducts.map((product, index) => `
    <a class="rank-row reveal" style="--delay:${index * 45}ms" href="#/product/${encodeURIComponent(product.id)}">
      <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="thumb-wrap">${renderProductImage(product.image, "", " loading=\"lazy\"")}</span>
      <span class="rank-copy"><strong>${escapeHtml(product.name)}</strong><small>${product.purchaseCount} ${receiptWord(product.purchaseCount)} · ${formatQuantity(product)}</small></span>
      <span class="rank-meter" aria-hidden="true"><i style="width:${product.purchaseCount / maxPurchases * 100}%"></i></span>
      <span class="rank-price">${formatMoney(product.lastPrice)}<small>остання ціна</small></span>
      <span class="arrow-button">${icons.arrow}</span>
    </a>
  `).join("");
  const periodLabel = selectedPeriod.label;
  const filterButtons = productPeriods.map((period) => `
    <button class="period-filter-button${period.key === selectedPeriodKey ? " is-selected" : ""}" type="button" data-period-key="${period.key}" aria-pressed="${period.key === selectedPeriodKey}">${period.label}</button>
  `).join("");

  renderShell(`
    ${snapshot.warnings?.length ? `<div class="warning-bar">${snapshot.warnings.map(escapeHtml).join(" ")}</div>` : ""}
    <section class="hero">
      <div class="hero-copy reveal">
        <p class="eyebrow">Ваш продуктовий рік · ${shortDate(snapshot.periodStart)}—${shortDate(snapshot.periodEnd)}</p>
        <h1>Що у вас<br><span>завжди в кошику?</span></h1>
        <p class="hero-note">Оберіть період для рейтингу товарів. Пакети й випадкова математика між кілограмами та штуками не враховуються.</p>
      </div>
      <div class="receipt-card reveal" style="--delay:100ms">
        <div class="receipt-top"><span>${icons.spark} ЗРІЗ ЗА ${periodLabel.toUpperCase()}</span><b>${selectedSummary.orders} чеків</b></div>
        <div class="receipt-total"><small>Усього покупок на</small><strong>${formatMoney(selectedSummary.spent)}</strong></div>
        <div class="receipt-stats">
          <div><small>Зекономлено</small><b>${formatMoney(selectedSummary.saved)}</b></div>
          <div><small>Балабонуси</small><b>+${money.format(selectedSummary.bonuses)}</b></div>
        </div>
        <div class="barcode" aria-hidden="true"></div><p>Пораховано локально для цієї сесії.</p>
      </div>
    </section>
    <section class="ranking-section" aria-labelledby="ranking-title">
      <div class="ranking-overview">
        <div class="ranking-left-panel">
          <div class="section-heading"><div><p class="eyebrow">Часті гості</p><h2 id="ranking-title">Топ-10 товарів</h2></div></div>
          <div class="ranking-filter-panel">
            <p class="ranking-explanation">Сортуємо за кількістю різних чеків. Якщо порівну — за придбаною кількістю.</p>
            <div class="period-filter" aria-label="Період для рейтингу товарів">${filterButtons}</div>
          </div>
        </div>
        ${topProducts.length ? renderTopProductsCommentary(topProducts) : ""}
      </div>
      ${topProducts.length ? `<div class="rank-list">${productRows}</div>` : `<p class="ranking-empty" role="status">За вибраний період (${periodLabel}) покупок не знайдено.</p>`}
    </section>
  `, false, scrollToTop);
  document.querySelectorAll("[data-period-key]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriodKey = button.dataset.periodKey;
      renderDashboard(false);
    });
  });
  document.querySelector("[data-top-products-commentary]")?.addEventListener("click", requestTopProductsCommentary);
}

function renderRecentPurchases(scrollToTop = true) {
  const currentPage = recentPurchasesOffset / 10 + 1;
  const recentSummary = summarizeOrders(recentPurchases);
  const purchaseRows = recentPurchases.map((purchase, index) => {
    const itemCount = visibleItemCount(purchase);
    return `
      <a class="receipt-row reveal" style="--delay:${index * 45}ms" href="#/receipt/${encodeURIComponent(purchase.id)}">
        <span class="receipt-row-number">${String(recentPurchasesOffset + index + 1).padStart(2, "0")}</span>
        <span class="receipt-row-date">${shortDate(purchase.createdAt)}</span>
        <span class="receipt-row-copy"><strong>${escapeHtml(purchase.magicName)}</strong><small>${escapeHtml(purchase.prediction || purchase.store)}</small></span>
        <span class="receipt-row-total"><strong>${formatMoney(purchase.total)}</strong><small>${itemCount} ${itemWord(itemCount)}</small></span>
        <span class="arrow-button">${icons.arrow}</span>
      </a>
    `;
  }).join("");

  renderShell(`
    <section class="hero recent-hero">
      <div class="hero-copy reveal">
        <p class="eyebrow">Останні покупки</p>
        <h1>Що ви купляли<br><span>останнім часом?</span></h1>
        <p class="hero-note">Зібрали чеки від найсвіжішого до найдавнішого. Відкрийте будь-який, щоб побачити товари й ціни в ньому.</p>
      </div>
      <div class="receipt-card reveal" style="--delay:100ms">
        <div class="receipt-top"><span>${icons.spark} ОСТАННІ ЧЕКИ</span><b>${recentSummary.orders} чеків</b></div>
        <div class="receipt-total"><small>Покупок на цій сторінці на</small><strong>${formatMoney(recentSummary.spent)}</strong></div>
        <div class="receipt-stats">
          <div><small>Зекономлено</small><b>${formatMoney(recentSummary.saved)}</b></div>
          <div><small>Балабонуси</small><b>+${money.format(recentSummary.bonuses)}</b></div>
        </div>
        <div class="barcode" aria-hidden="true"></div><p>Показано по 10 чеків за раз.</p>
      </div>
    </section>
    <section class="ranking-section recent-purchases-section" aria-label="Останні чеки">
      ${recentPurchasesWarnings.length ? `<div class="warning-bar">${recentPurchasesWarnings.map(escapeHtml).join(" ")}</div>` : ""}
      ${recentPurchasesState === "loading" ? `<p class="ranking-empty" role="status">Завантажуємо чеки…</p>` : ""}
      ${recentPurchasesState === "error" ? `<div class="error-note" role="alert">${escapeHtml(recentPurchasesError)} <button class="text-button" type="button" data-retry-recent>Спробувати ще раз</button></div>` : ""}
      ${recentPurchasesState === "ready" && !recentPurchases.length ? `<p class="ranking-empty" role="status">За останній рік чеків не знайдено.</p>` : ""}
      ${recentPurchasesState === "ready" && recentPurchases.length ? `
        <div class="receipt-list">${purchaseRows}</div>
        <nav class="pagination" aria-label="Сторінки останніх покупок">
          <button class="pagination-button" type="button" data-recent-page="previous"${recentPurchasesOffset === 0 ? " disabled" : ""}>${icons.back}<span>Попередні</span></button>
          <span class="pagination-current">Сторінка ${currentPage}</span>
          <button class="pagination-button" type="button" data-recent-page="next"${recentPurchasesHasMore ? "" : " disabled"}><span>Наступні</span>${icons.arrow}</button>
        </nav>
      ` : ""}
    </section>
  `, false, scrollToTop);
  document.querySelector("[data-retry-recent]")?.addEventListener("click", () => loadRecentPurchasesPage(recentPurchasesOffset));
  document.querySelectorAll("[data-recent-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = button.dataset.recentPage === "next" ? recentPurchasesOffset + 10 : recentPurchasesOffset - 10;
      loadRecentPurchasesPage(offset);
    });
  });
  if (recentPurchasesState === "idle") void loadRecentPurchasesPage(0);
}

function renderReceipt(id, scrollToTop = true) {
  const receipt = findReceipt(id);
  if (!receipt) return renderNotFound();
  currentReceipt = receipt;
  resetReceiptCommentaryFor(receipt);
  const items = receipt.products.filter((item) => !item.excluded);
  const itemCount = visibleItemCount(receipt);
  const itemsTotal = items.reduce((total, item) => total + item.quantity * item.price, 0);

  renderShell(`
    <nav class="back-nav reveal"><a href="#/recent-purchases">${icons.back}<span>Останні покупки</span></a><span>Чек поточної сесії</span></nav>
    <section class="receipt-detail-hero">
      <div class="receipt-detail-summary reveal">
        <p class="eyebrow">${shortDate(receipt.createdAt)}</p>
        <h1>${escapeHtml(receipt.magicName)}</h1>
        <p>${escapeHtml(receipt.prediction || receipt.store)}</p>
        <dl>
          <div><dt>Усього</dt><dd>${formatMoney(receipt.total)}</dd></div>
          <div><dt>Товарів</dt><dd>${itemCount}</dd></div>
          <div><dt>Знижка</dt><dd>${formatMoney(receipt.discount)}</dd></div>
        </dl>
      </div>
      ${renderReceiptCommentary()}
    </section>
    <section class="receipt-items-section" aria-labelledby="receipt-items-title">
      <div class="section-heading compact"><div><p class="eyebrow">Перелік у чеку</p><h2 id="receipt-items-title">Товари й ціни</h2></div><p>Ціни зафіксовані під час цієї покупки, а не є поточними цінами каталогу.</p></div>
      ${items.length ? `<div class="receipt-items-list">${items.map((item, index) => `
        <article class="receipt-item-row">
          <span class="receipt-item-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="receipt-item-image">${renderProductImage(item.image, "", " loading=\"lazy\"")}</span>
          <span class="receipt-item-name"><strong>${escapeHtml(item.name)}</strong><small>${formatItemQuantity(item)}</small></span>
          <span class="receipt-item-price"><small>Ціна</small><strong>${formatMoney(item.price)}</strong></span>
          <span class="receipt-item-total"><small>Сума</small><strong>${formatMoney(item.quantity * item.price)}</strong></span>
        </article>
      `).join("")}</div>
      <div class="receipt-items-total"><span>Товари у чеку</span><strong>${formatMoney(itemsTotal)}</strong></div>` : `<p class="ranking-empty" role="status">У цьому чеку немає товарів для відображення.</p>`}
    </section>
  `, true, scrollToTop);
  document.querySelector("[data-receipt-commentary]")?.addEventListener("click", requestReceiptCommentary);
}

function renderProduct(id) {
  const product = products.find((item) => String(item.id) === String(id));
  if (!product) return renderNotFound();
  const rank = topProducts.findIndex((item) => item.id === product.id) + 1;
  const history = [...product.history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const priceMin = Math.min(...history.map((item) => item.price));
  const priceMax = Math.max(...history.map((item) => item.price));
  renderShell(`
    <nav class="back-nav reveal"><a href="#/">${icons.back}<span>Усі покупки</span></a><span>Товар № ${escapeHtml(product.id)}</span></nav>
    <section class="product-hero">
      <div class="product-photo reveal"><span class="rank-sticker">#${rank || "—"}<small>у вашому топі</small></span>${renderProductImage(product.image, product.name, "", '<span class="image-placeholder">◌</span>')}</div>
      <div class="product-copy reveal" style="--delay:80ms">
        <p class="eyebrow">${product.weighted ? "Ваговий товар" : escapeHtml(product.unit)}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-lede">За рік цей товар з’явився у ${product.purchaseCount} ${receiptWord(product.purchaseCount)}. Це персональна історія поточної MCP-сесії.</p>
        <div class="product-price"><strong>${formatMoney(product.lastPrice)}</strong><span>ціна під час<br>останньої покупки</span></div>
        <dl class="fact-grid">
          <div><dt>Придбано</dt><dd>${formatQuantity(product)}</dd></div><div><dt>Витрачено</dt><dd>${formatMoney(product.spentTotal)}</dd></div>
          <div><dt>Середня ціна</dt><dd>${formatMoney(product.averagePrice)}</dd></div><div><dt>Діапазон цін</dt><dd>${formatMoney(priceMin)}—${formatMoney(priceMax)}</dd></div>
        </dl>
      </div>
    </section>
    <section class="history-section" aria-labelledby="history-title">
      <div class="section-heading compact"><div><p class="eyebrow">Сліди в чеках</p><h2 id="history-title">Історія покупок</h2></div><p>${history.length > 1 ? "Порівняйте, як змінювалася ціна." : "Одна зафіксована покупка за період."}</p></div>
      <div class="history-list">${history.map((item, index) => `
        <article class="history-row">
          <span class="history-index">${String(index + 1).padStart(2, "0")}</span>
          <div><small>Дата</small><strong>${date.format(new Date(item.createdAt))}</strong></div>
          <div><small>Кількість</small><strong>${item.quantity.toLocaleString("uk-UA", { maximumFractionDigits: 3 })} ${escapeHtml(item.unit)}</strong></div>
          <div><small>Ціна</small><strong>${formatMoney(item.price)}</strong></div>
          <div><small>Сума</small><strong>${formatMoney(item.spent)}</strong></div>
          <span class="receipt-private">Поточна сесія</span>
        </article>`).join("")}</div>
    </section>
    <aside class="insight-strip"><span>${icons.cart}</span><p><small>Невелике спостереження</small><strong>${insightFor(product, rank)}</strong></p></aside>
  `, true);
}

function renderEmpty() {
  renderShell(`
    <section class="connection-screen">
      <p class="eyebrow">Дані завантажено</p><h1>За цей рік<br><span>чеків не знайдено</span></h1>
      <p>Silpo MCP не повернув покупок у межах останніх 12 місяців.</p>
      <button class="secondary-button" data-refresh>Перевірити ще раз</button>
    </section>`);
  document.querySelector("[data-refresh]")?.addEventListener("click", loadData);
}

function renderNotFound() {
  renderShell(`<section class="not-found"><span>404</span><h1>Цей товар загубився між полицями</h1><a class="primary-button" href="#/">Повернутися до покупок ${icons.arrow}</a></section>`, true);
}

async function login() {
  const button = document.querySelector("[data-login]");
  button.disabled = true;
  button.textContent = "Готуємо захищений вхід…";
  try {
    const response = await fetch("/api/auth/start", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Не вдалося почати авторизацію.");
    if (result.authorizationUrl) location.assign(result.authorizationUrl);
    else await loadData();
  } catch (error) {
    renderLogin(error.message);
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  snapshot = null;
  products = [];
  topProducts = [];
  selectedPeriodKey = "12m";
  topProductsCommentary = "";
  commentaryState = "idle";
  commentaryProductsKey = "";
  recentPurchases = [];
  recentPurchasesOffset = 0;
  recentPurchasesHasMore = false;
  recentPurchasesWarnings = [];
  recentPurchasesState = "idle";
  recentPurchasesError = "";
  currentReceipt = null;
  receiptCommentary = "";
  receiptCommentaryState = "idle";
  receiptCommentaryKey = "";
  renderLogin();
}

async function loadData() {
  renderLoading();
  try {
    const response = await fetch("/api/analytics", { cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) return renderLogin();
    if (!response.ok) throw new Error(result.message || "Не вдалося завантажити покупки.");
    snapshot = result;
    route();
  } catch (error) {
    renderLogin(error.message);
  }
}

function insightFor(product, rank) {
  if (rank === 1) return `Ваш беззаперечний фаворит: ${product.purchaseCount} появ у чеках за рік.`;
  if (product.weighted) return `Разом набралося ${formatQuantity(product)} — вагу рахуємо окремо від штучних товарів.`;
  if (product.quantityTotal > product.purchaseCount) return `Ви часто брали більше одного: ${formatQuantity(product)} у ${product.purchaseCount} чеках.`;
  return "Разова знахідка сезону — ще один штрих до вашого продуктового портрета.";
}

function resetCommentaryFor(currentTopProducts) {
  const productKey = currentTopProducts.map((product) => `${product.id}:${product.purchaseCount}`).join("|");
  if (productKey === commentaryProductsKey) return;
  commentaryProductsKey = productKey;
  topProductsCommentary = "";
  commentaryState = "idle";
}

function renderTopProductsCommentary(currentTopProducts) {
  return renderPocketCritic({
    action: "top-products-commentary",
    commentary: topProductsCommentary,
    disclosure: `Лише назви й частота ${currentTopProducts.length} товарів → OpenRouter`,
    emptyMessage: "Натисніть — і кишеньковий критик складе дотепну репліку про ваш продуктовий каст.",
    state: commentaryState,
    titleId: "commentary-title"
  });
}

function renderPocketCritic({ action, commentary, disclosure, emptyMessage, state, titleId }) {
  const content = state === "ready"
    ? escapeHtml(commentary)
    : state === "loading"
      ? "Кишеньковий критик переглядає кошик…"
      : state === "error"
        ? escapeHtml(commentary)
        : emptyMessage;
  const buttonLabel = state === "loading"
    ? "Критик думає…"
    : state === "ready"
      ? "Ще одна репліка"
      : state === "error"
        ? "Спробувати ще раз"
        : "Почути критика";
  const commentarySize = commentaryTextSize(content);

  return `
    <aside class="top-products-commentary${state === "ready" ? " is-ready" : ""}" aria-labelledby="${titleId}">
      <div class="commentary-bubble">
        <p class="eyebrow">Кишеньковий критик</p>
        <h3 id="${titleId}" style="--commentary-size:${commentarySize}">${content}</h3>
        <div class="commentary-actions">
          <button class="commentary-button" type="button" data-${action}${state === "loading" ? " disabled" : ""}>${buttonLabel}</button>
          <small>${disclosure}</small>
        </div>
      </div>
    </aside>
  `;
}

function commentaryTextSize(value) {
  const length = String(value).length;
  if (length > 220) return "1.02rem";
  if (length > 160) return "1.18rem";
  if (length > 100) return "1.42rem";
  return "1.72rem";
}

async function requestTopProductsCommentary() {
  const requestedKey = commentaryProductsKey;
  const productsForCommentary = topProducts.map(({ name, purchaseCount }) => ({ name, purchaseCount }));
  commentaryState = "loading";
  renderDashboard(false);

  try {
    const response = await fetch("/api/top-products-commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: productsForCommentary })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.commentary !== "string") {
      throw new Error(result.message || "Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.");
    }
    topProductsCommentary = result.commentary;
    commentaryState = "ready";
  } catch (error) {
    topProductsCommentary = error instanceof Error ? error.message : "Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.";
    commentaryState = "error";
  }

  if (requestedKey === commentaryProductsKey) renderDashboard(false);
}

async function loadRecentPurchasesPage(offset) {
  recentPurchasesOffset = Math.max(0, offset);
  recentPurchasesState = "loading";
  recentPurchasesError = "";
  renderRecentPurchases(false);

  try {
    const response = await fetch(`/api/recent-purchases?offset=${recentPurchasesOffset}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      snapshot = null;
      return renderLogin("Сесію завершено. Увійдіть ще раз, щоб завантажити останні покупки.");
    }
    if (!response.ok || !Array.isArray(result.orders)) {
      throw new Error(result.message || "Не вдалося завантажити останні покупки.");
    }
    recentPurchases = result.orders;
    recentPurchasesHasMore = Boolean(result.hasMore);
    recentPurchasesWarnings = Array.isArray(result.warnings) ? result.warnings : [];
    recentPurchasesState = "ready";
  } catch (error) {
    recentPurchases = [];
    recentPurchasesHasMore = false;
    recentPurchasesWarnings = [];
    recentPurchasesError = error instanceof Error ? error.message : "Не вдалося завантажити останні покупки.";
    recentPurchasesState = "error";
  }

  if (location.hash === "#/recent-purchases") renderRecentPurchases(false);
}

function resetReceiptCommentaryFor(receipt) {
  if (receipt.id === receiptCommentaryKey) return;
  receiptCommentaryKey = receipt.id;
  receiptCommentary = "";
  receiptCommentaryState = "idle";
}

function renderReceiptCommentary() {
  return renderPocketCritic({
    action: "receipt-commentary",
    commentary: receiptCommentary,
    disclosure: "Лише назва й кількість товарів цього чеку → OpenRouter",
    emptyMessage: "Натисніть — і кишеньковий критик складе дотепну репліку про цей чек.",
    state: receiptCommentaryState,
    titleId: "receipt-commentary-title"
  });
}

async function requestReceiptCommentary() {
  if (!currentReceipt) return;
  const requestedKey = receiptCommentaryKey;
  const purchasesForCommentary = [{
    name: currentReceipt.magicName,
    itemCount: visibleItemCount(currentReceipt)
  }];
  receiptCommentaryState = "loading";
  renderReceipt(currentReceipt.id, false);

  try {
    const response = await fetch("/api/recent-purchases-commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchases: purchasesForCommentary })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.commentary !== "string") {
      throw new Error(result.message || "Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.");
    }
    receiptCommentary = result.commentary;
    receiptCommentaryState = "ready";
  } catch (error) {
    receiptCommentary = error instanceof Error ? error.message : "Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.";
    receiptCommentaryState = "error";
  }

  if (requestedKey === receiptCommentaryKey && currentReceipt) renderReceipt(currentReceipt.id, false);
}

function receiptWord(count) { return count === 1 ? "чеку" : "чеках"; }
function itemWord(count) { return count === 1 ? "товар" : count > 1 && count < 5 ? "товари" : "товарів"; }
function visibleItemCount(order) { return order.products.filter((item) => !item.excluded).length; }
function formatItemQuantity(item) { return `${item.quantity.toLocaleString("uk-UA", { maximumFractionDigits: 3 })} ${escapeHtml(item.unit)}`; }
function findReceipt(id) { return [...recentPurchases, ...(snapshot?.orders || [])].find((receipt) => String(receipt.id) === String(id)); }
function shortDate(value) { return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

function renderProductImage(value, alt, extraAttributes = "", fallback = "<i>◌</i>") {
  const imageUrl = safeImageUrl(value);
  if (!imageUrl) return fallback;
  return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}"${extraAttributes} referrerpolicy="no-referrer" />`;
}

function safeImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function route() {
  if (!snapshot) return;
  const match = location.hash.match(/^#\/product\/(.+)$/);
  const receiptMatch = location.hash.match(/^#\/receipt\/(.+)$/);
  if (match) renderProduct(decodeURIComponent(match[1]));
  else if (receiptMatch) renderReceipt(decodeURIComponent(receiptMatch[1]));
  else if (location.hash === "#/recent-purchases") renderRecentPurchases();
  else if (!location.hash || location.hash === "#/" || location.hash === "#") renderDashboard();
  else renderNotFound();
}

window.addEventListener("hashchange", route);
const authError = new URLSearchParams(location.search).get("auth_error");
if (authError) {
  history.replaceState({}, "", "/#/");
  renderLogin("Авторизацію не завершено. Спробуйте увійти ще раз.");
} else {
  loadData();
}
