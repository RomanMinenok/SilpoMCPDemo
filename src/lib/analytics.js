export function aggregateProducts(orders) {
  const products = new Map();

  for (const order of orders) {
    for (const item of order.products) {
      if (item.excluded) continue;
      const current = products.get(item.id) ?? {
        ...item,
        purchaseCount: 0,
        quantityTotal: 0,
        spentTotal: 0,
        history: []
      };

      const spent = item.quantity * item.price;
      current.purchaseCount += 1;
      current.quantityTotal += item.quantity;
      current.spentTotal += spent;
      if (!current.lastPurchasedAt || new Date(order.createdAt) > new Date(current.lastPurchasedAt)) {
        current.lastPrice = item.price;
        current.lastPurchasedAt = order.createdAt;
      }
      current.history.push({
        orderId: order.id,
        createdAt: order.createdAt,
        store: order.store,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        spent,
        source: order.store
      });
      products.set(item.id, current);
    }
  }

  return [...products.values()]
    .map((product) => ({
      ...product,
      averagePrice: product.history.reduce((sum, item) => sum + item.price, 0) / product.purchaseCount
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount || b.quantityTotal - a.quantityTotal || b.spentTotal - a.spentTotal);
}

export function summarizeOrders(orders) {
  return orders.reduce((summary, order) => {
    summary.orders += 1;
    summary.spent += order.total;
    summary.saved += order.discount;
    summary.bonuses += order.bonuses;
    summary.items += order.products.filter((item) => !item.excluded).length;
    return summary;
  }, { orders: 0, spent: 0, saved: 0, bonuses: 0, items: 0 });
}

export function formatQuantity(product) {
  if (product.weighted) return `${product.quantityTotal.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} кг`;
  return `${product.quantityTotal.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} од.`;
}
