import Order from "@/models/Order";
import Product, { HAS_SHOPIFY_ID } from "@/models/Product";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOP_PRODUCTS_DAYS = 30;
const RECENT_ORDERS = 8;

export const REVENUE_DEFINITION =
  "Revenue = sum of each order's current total (includes tax and shipping; reflects edits, returns and refunds), excluding cancelled and voided orders. Grouped by order date in the store's time zone.";

export const EXPENSE_DEFINITION =
  "Expenses are calculated, not entered: product cost (units sold × each variant's Cost per item in Shopify) + Shopify payment fees on the order's transactions + packaging (units shipped × your packaging cost per item). Shipping label costs and advertising are not available from Shopify and are not included.";

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// "all" or "YYYY-MM"; anything else is treated as "all".
export function parsePeriod(value) {
  const match = typeof value === "string" ? PERIOD_RE.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

// Order total after edits, returns and refunds when Shopify provides it.
const revenueExpr = { $ifNull: ["$currentTotalPrice", "$totalPrice"] };

const round2 = (n) => Math.round(n * 100) / 100;

function validTimezone(tz) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function yearMonthIn(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year").value),
    month: Number(parts.find((p) => p.type === "month").value),
  };
}

function percentChange(current, previous) {
  if (!previous) return null; // no baseline: don't invent a percentage
  return round2(((current - previous) / previous) * 100);
}

function fulfillmentLabel(order) {
  if (order.cancelledAt) return "Cancelled";
  switch (order.fulfillmentStatus) {
    case "fulfilled":
      return "Fulfilled";
    case "partial":
      return "Partially fulfilled";
    case "restocked":
      return "Restocked";
    default:
      return "Unfulfilled";
  }
}

// Builds every dashboard figure from MongoDB for the given user's stores.
// `period`: "all" (default) or "YYYY-MM" for the cards; `packagingCostPerItem`
// from the user's settings.
export async function getDashboardSummary(userId, stores, { now = new Date(), period = "all", packagingCostPerItem = 0 } = {}) {
  const storeIds = stores.map((s) => s._id);
  const timezone = validTimezone(stores[0]?.timezone);
  // Orders deleted in Shopify are kept but never shown or counted.
  const scope = { user: userId, shopifyStore: { $in: storeIds }, deletedAt: null };
  const countable = { ...scope, cancelledAt: null, financialStatus: { $ne: "voided" } };

  const { year, month } = yearMonthIn(now, timezone);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const monthKey = {
    y: { $year: { date: "$shopifyCreatedAt", timezone } },
    m: { $month: { date: "$shopifyCreatedAt", timezone } },
  };

  const currencies = await Order.aggregate([
    { $match: countable },
    { $group: { _id: "$currency", orders: { $sum: 1 } } },
    { $sort: { orders: -1 } },
  ]);
  const currency = currencies[0]?._id || stores[0]?.currency || null;
  const otherCurrencies = currencies
    .slice(1)
    .map((c) => ({ currency: c._id, orders: c.orders }));

  const inCurrency = { ...countable, currency };
  // Units shipped on a line: quantity minus what is still to ship; when that
  // is unknown, all of a fulfilled order's units.
  const toShip = { $ifNull: ["$lineItems.fulfillableQuantity", -1] };
  const shippedExpr = {
    $cond: [
      { $gte: [toShip, 0] },
      { $max: [0, { $subtract: ["$lineItems.quantity", toShip] }] },
      { $cond: [{ $eq: ["$fulfillmentStatus", "fulfilled"] }, "$lineItems.quantity", 0] },
    ],
  };

  const [orderBuckets, lineBuckets, costDocs, recent, topProducts, productCount, orderCount] =
    await Promise.all([
      Order.aggregate([
        { $match: inCurrency },
        {
          $group: {
            _id: monthKey,
            revenue: { $sum: revenueExpr },
            orders: { $sum: 1 },
            fees: { $sum: { $ifNull: ["$shopifyFees", 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: inCurrency },
        { $unwind: "$lineItems" },
        {
          $group: {
            _id: { y: monthKey.y, m: monthKey.m, v: "$lineItems.variantId" },
            units: { $sum: "$lineItems.quantity" },
            shipped: { $sum: shippedExpr },
          },
        },
      ]),
      Product.find({ user: userId, shopifyStore: { $in: storeIds } }).select("variantCosts").lean(),
      Order.find(scope)
        .sort({ shopifyCreatedAt: -1 })
        .limit(RECENT_ORDERS)
        .select("name orderNumber customer.name lineItems.title currentTotalPrice totalPrice currency financialStatus fulfillmentStatus cancelledAt shopifyCreatedAt")
        .lean(),
      Order.aggregate([
        {
          $match: {
            ...inCurrency,
            shopifyCreatedAt: { $gte: new Date(now.getTime() - TOP_PRODUCTS_DAYS * 86400000) },
          },
        },
        { $unwind: "$lineItems" },
        {
          $group: {
            _id: { $ifNull: ["$lineItems.productId", "$lineItems.title"] },
            title: { $first: "$lineItems.title" },
            units: { $sum: "$lineItems.quantity" },
            revenue: { $sum: { $multiply: ["$lineItems.quantity", "$lineItems.price"] } },
          },
        },
        { $sort: { units: -1, revenue: -1 } },
        { $limit: 5 },
      ]),
      Product.countDocuments({ ...scope, archivedAt: null, ...HAS_SHOPIFY_ID }),
      Order.countDocuments(scope),
    ]);

  // Cost per item by variant ID (from Shopify; missing = unknown).
  const unitCost = new Map();
  for (const doc of costDocs) {
    for (const [variantId, cost] of Object.entries(doc.variantCosts || {})) {
      if (cost !== null && cost !== undefined) unitCost.set(String(variantId), Number(cost));
    }
  }

  const key = (y, m) => `${y}-${m}`;
  const buckets = new Map();
  const bucketFor = (y, m) => {
    const k = key(y, m);
    if (!buckets.has(k)) buckets.set(k, { revenue: 0, orders: 0, fees: 0, productCost: 0, shippedUnits: 0, unitsWithoutCost: 0 });
    return buckets.get(k);
  };
  for (const b of orderBuckets) {
    Object.assign(bucketFor(b._id.y, b._id.m), { revenue: b.revenue, orders: b.orders, fees: b.fees });
  }
  for (const line of lineBuckets) {
    const bucket = bucketFor(line._id.y, line._id.m);
    const cost = line._id.v ? unitCost.get(String(line._id.v)) : undefined;
    if (cost === undefined) bucket.unitsWithoutCost += line.units;
    else bucket.productCost += line.units * cost;
    bucket.shippedUnits += line.shipped;
  }

  const packagingRate = Number(packagingCostPerItem) > 0 ? Number(packagingCostPerItem) : 0;
  const figuresOf = (raw) => {
    const b = raw || { revenue: 0, orders: 0, fees: 0, productCost: 0, shippedUnits: 0, unitsWithoutCost: 0 };
    const revenue = round2(b.revenue);
    const productCost = round2(b.productCost);
    const shopifyFees = round2(b.fees);
    const packaging = round2(b.shippedUnits * packagingRate);
    const expense = round2(productCost + shopifyFees + packaging);
    const profit = round2(revenue - expense);
    return {
      revenue,
      orders: b.orders,
      expense,
      profit,
      averageOrderValue: b.orders ? round2(revenue / b.orders) : null,
      ProfitMargin: revenue ? round2((profit / revenue) * 100) : null,
      Roi: expense ? round2((profit / expense) * 100) : null,
      costs: { productCost, shopifyFees, packaging, shippedUnits: b.shippedUnits, unitsWithoutCost: b.unitsWithoutCost },
    };
  };
  const figuresFor = (y, m) => figuresOf(buckets.get(key(y, m)));
  const allTime = () => {
    const sum = { revenue: 0, orders: 0, fees: 0, productCost: 0, shippedUnits: 0, unitsWithoutCost: 0 };
    for (const b of buckets.values()) for (const k of Object.keys(sum)) sum[k] += b[k];
    return figuresOf(sum);
  };

  const monthly = MONTHS.map((label, i) => ({ month: label, ...figuresFor(year, i + 1) }));
  const current = figuresFor(year, month);
  const previous = figuresFor(prev.year, prev.month);

  // The period the cards show: all time (default) or one month, compared
  // with the month before it.
  const selectedMonth = parsePeriod(period);
  const selected = selectedMonth ? figuresFor(selectedMonth.year, selectedMonth.month) : allTime();
  const before = selectedMonth
    ? figuresFor(
        selectedMonth.month === 1 ? selectedMonth.year - 1 : selectedMonth.year,
        selectedMonth.month === 1 ? 12 : selectedMonth.month - 1,
      )
    : null;
  const periodLabel = (y, m) => `${MONTHS[m - 1]} ${y}`;
  const months = new Set([key(year, month), ...buckets.keys()]);
  const availableMonths = [...months]
    .map((k) => k.split("-").map(Number))
    .sort((a, b) => b[0] - a[0] || b[1] - a[1])
    .map(([y, m]) => ({ value: `${y}-${String(m).padStart(2, "0")}`, label: periodLabel(y, m) }));

  return {
    hasStore: stores.length > 0,
    currency,
    otherCurrencies,
    timezone,
    year,
    monthLabel: MONTHS[month - 1],
    definitions: { revenue: REVENUE_DEFINITION, expense: EXPENSE_DEFINITION },
    period: selectedMonth
      ? { value: `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`, label: periodLabel(selectedMonth.year, selectedMonth.month) }
      : { value: "all", label: "All time" },
    availableMonths,
    selected,
    selectedChange: before
      ? {
          revenue: percentChange(selected.revenue, before.revenue),
          orders: percentChange(selected.orders, before.orders),
          averageOrderValue: percentChange(selected.averageOrderValue, before.averageOrderValue),
          expense: percentChange(selected.expense, before.expense),
        }
      : null,
    packagingCostPerItem: packagingRate,
    monthly,
    current,
    previous,
    change: {
      revenue: percentChange(current.revenue, previous.revenue),
      orders: percentChange(current.orders, previous.orders),
      averageOrderValue: percentChange(current.averageOrderValue, previous.averageOrderValue),
      expense: percentChange(current.expense, previous.expense),
    },
    totals: { products: productCount, orders: orderCount },
    recentOrders: recent.map((order) => {
      const items = order.lineItems || [];
      return {
        id: String(order._id),
        orderId: order.name || (order.orderNumber ? `#${order.orderNumber}` : "—"),
        customer: order.customer?.name || "—",
        product: items.length
          ? `${items[0].title}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
          : "—",
        amount: order.currentTotalPrice ?? order.totalPrice,
        currency: order.currency,
        status: fulfillmentLabel(order),
        paymentStatus: order.financialStatus || null,
        date: order.shopifyCreatedAt,
      };
    }),
    topProducts: topProducts.map((p) => ({
      productId: p._id,
      title: p.title,
      units: p.units,
      revenue: round2(p.revenue),
    })),
  };
}
