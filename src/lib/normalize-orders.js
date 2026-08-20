const BAG_PATTERN = /(^|\s)(пакет|пакет-майка|біорозкладний)(\s|$)/iu;

export function normalizeOfflineOrders(orders = []) {
  return orders.map((order, orderIndex) => ({
    id: `offline-${order.createdAt}-${order.filId}-${orderIndex}`,
    createdAt: withLocalOffset(order.createdAt),
    store: [order.cityName, order.filialName].filter(Boolean).join(" · "),
    total: number(order.sumReg),
    discount: number(order.sumDiscount),
    bonuses: number(order.accruedBalaBonusesSum),
    magicName: order.chequeMagicName || "Покупка у Сільпо",
    prediction: order.chequePrediction || "",
    products: (order.products || []).map((item) => ({
      id: String(item.lagerId),
      name: item.catalogProduct?.name || item.name,
      unit: item.unit || "од.",
      quantity: number(item.quantity),
      price: number(item.price),
      image: normalizeImageUrl(item.catalogProduct?.image || item.image),
      weighted: isWeighted(item.unit, item.catalogProduct?.weighted),
      excluded: BAG_PATTERN.test(item.name || "")
    }))
  }));
}

export function normalizeOnlineOrders(orders = []) {
  return orders
    .filter((order) => order.status !== "cancelled")
    .map((order) => ({
      id: `online-${order.orderId}`,
      createdAt: order.createdAt,
      store: "Онлайн-замовлення",
      total: number(order.amount),
      discount: number(order.discount),
      bonuses: 0,
      magicName: order.number ? `Замовлення №${order.number}` : "Онлайн-замовлення",
      prediction: deliveryLabel(order.delivery?.type),
      products: (order.products || [])
        .filter((item) => !item.removed)
        .map((item) => ({
          id: `online-${item.id}`,
          name: item.name,
          unit: "шт",
          quantity: number(item.quantity),
          price: number(item.price),
          image: normalizeImageUrl(item.image),
          weighted: !Number.isInteger(number(item.quantity)),
          excluded: BAG_PATTERN.test(item.name || "")
        }))
    }));
}

export function withinPeriod(orders, periodStart, periodEnd) {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  return orders
    .filter((order) => {
      const time = new Date(order.createdAt).getTime();
      return Number.isFinite(time) && time >= start && time <= end;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function normalizeImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function isWeighted(unit, catalogWeighted) {
  if (typeof catalogWeighted === "boolean") return catalogWeighted;
  return String(unit).trim().toLowerCase() === "кг";
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function deliveryLabel(type) {
  if (!type) return "";
  if (type === "SelfPickup") return "Самовивіз";
  return "Доставка";
}

function withLocalOffset(value) {
  if (!value || /(?:Z|[+-]\d\d:\d\d)$/u.test(value)) return value;
  return `${value}+03:00`;
}
