import Order from "@/models/Order";
import Product, { HAS_SHOPIFY_ID } from "@/models/Products";
import Expense from "@/models/Expensive";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOP_PRODUCTS_DAYS = 30;
const RECENT_ORDERS = 8;

export const REVENUE_DEFINITION =
  "Revenue = sum of each order's current total (includes tax and shipping; reflects edits, returns and refunds), excluding cancelled and voided orders. Grouped by order date in the store's time zone.";

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
export async function getDashboardSummary(userId, stores, { now = new Date() } = {}) {
  const storeIds = stores.map((s) => s._id);
  const timezone = validTimezone(stores[0]?.timezone);
  const scope = { user: userId, shopifyStore: { $in: storeIds } };
  const countable = { ...scope, cancelledAt: null, financialStatus: { $ne: "voided" } };

  const { year, month } = yearMonthIn(now, timezone);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  // Generous lower bound; exact month buckets are computed in the store's zone.
  const since = new Date(Date.UTC(year - 1, 10, 1));
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

  const [orderBuckets, expenseBuckets, recent, topProducts, productCount, orderCount] =
    await Promise.all([
      Order.aggregate([
        { $match: { ...inCurrency, shopifyCreatedAt: { $gte: since } } },
        { $group: { _id: monthKey, revenue: { $sum: revenueExpr }, orders: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { user: userId, currency, date: { $gte: since } } },
        {
          $group: {
            _id: {
              y: { $year: { date: "$date", timezone } },
              m: { $month: { date: "$date", timezone } },
            },
            amount: { $sum: "$amount" },
          },
        },
      ]),
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

  const bucket = new Map(orderBuckets.map((b) => [`${b._id.y}-${b._id.m}`, b]));
  const expenseBucket = new Map(expenseBuckets.map((b) => [`${b._id.y}-${b._id.m}`, b.amount]));

  const figuresFor = (y, m) => {
    const revenue = round2(bucket.get(`${y}-${m}`)?.revenue || 0);
    const orders = bucket.get(`${y}-${m}`)?.orders || 0;
    const expense = round2(expenseBucket.get(`${y}-${m}`) || 0);
    const profit = round2(revenue - expense);
    return {
      revenue,
      orders,
      expense,
      profit,
      averageOrderValue: orders ? round2(revenue / orders) : null,
      ProfitMargin: revenue ? round2((profit / revenue) * 100) : null,
      Roi: expense ? round2((profit / expense) * 100) : null,
    };
  };

  const monthly = MONTHS.map((label, i) => ({ month: label, ...figuresFor(year, i + 1) }));
  const current = figuresFor(year, month);
  const previous = figuresFor(prev.year, prev.month);

  return {
    hasStore: stores.length > 0,
    currency,
    otherCurrencies,
    timezone,
    year,
    monthLabel: MONTHS[month - 1],
    definitions: { revenue: REVENUE_DEFINITION },
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
