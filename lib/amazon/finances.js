import crypto from "node:crypto";

// Finances: transactions from Finances API 2024-06-19 listTransactions, and
// settlement groups from Finances API v0 listFinancialEventGroups (both with
// NextToken pagination). Allowlisted fields only: transaction `contexts`
// (payment references and similar), bank account digits (AccountTail) and
// trace IDs are never stored.

const str = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const date = (v) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const money = (m) => {
  const amount = Number(m?.currencyAmount ?? m?.CurrencyAmount);
  const currency = m?.currencyCode ?? m?.CurrencyCode;
  return Number.isFinite(amount) && str(currency, 3) ? { amount, currency } : null;
};

const RELATED_IDS = new Set(["ORDER_ID", "SHIPMENT_ID", "FINANCIAL_EVENT_GROUP_ID", "REFUND_ID", "INVOICE_ID", "SETTLEMENT_ID"]);

function breakdowns(list, depth = 0) {
  if (!Array.isArray(list) || depth > 3) return [];
  return list.slice(0, 50).map((b) => {
    const out = { type: str(b?.breakdownType, 100), amount: money(b?.breakdownAmount) };
    const children = breakdowns(b?.breakdowns, depth + 1);
    if (children.length) out.breakdowns = children;
    return out;
  });
}

// transactionId is optional in Amazon's model. Without it, a deterministic ID
// from Amazon's own fields keeps re-syncs idempotent.
function transactionKey(t, relatedIdentifiers) {
  const id = str(t?.transactionId, 200);
  if (id) return id;
  if (!t?.postedDate || !t?.totalAmount) return null;
  const basis = JSON.stringify([t.postedDate, t.transactionType, t.totalAmount?.currencyAmount, t.totalAmount?.currencyCode, relatedIdentifiers]);
  return `derived:${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 40)}`;
}

export function toSafeTransaction(t) {
  if (!t || typeof t !== "object") return null;
  const relatedIdentifiers = (Array.isArray(t.relatedIdentifiers) ? t.relatedIdentifiers : [])
    .filter((r) => RELATED_IDS.has(r?.relatedIdentifierName) && str(r?.relatedIdentifierValue, 100))
    .map((r) => ({ name: r.relatedIdentifierName, value: r.relatedIdentifierValue }));
  const eventId = transactionKey(t, relatedIdentifiers);
  if (!eventId) return null;
  return {
    kind: "transaction",
    eventId,
    transactionType: str(t.transactionType, 100),
    transactionStatus: str(t.transactionStatus, 50),
    description: str(t.description, 300),
    postedDate: date(t.postedDate),
    marketplaceId: str(t.marketplaceDetails?.marketplaceId, 20),
    orderId: relatedIdentifiers.find((r) => r.name === "ORDER_ID")?.value || null,
    relatedIdentifiers,
    total: money(t.totalAmount),
    breakdowns: breakdowns(t.breakdowns),
  };
}

export function toSafeEventGroup(g) {
  const eventId = str(g?.FinancialEventGroupId, 200);
  if (!eventId) return null;
  return {
    kind: "event_group",
    eventId,
    processingStatus: str(g.ProcessingStatus, 50),
    fundTransferStatus: str(g.FundTransferStatus, 50),
    fundTransferDate: date(g.FundTransferDate),
    groupStart: date(g.FinancialEventGroupStart),
    groupEnd: date(g.FinancialEventGroupEnd),
    postedDate: date(g.FinancialEventGroupStart),
    originalTotal: money(g.OriginalTotal),
    total: money(g.ConvertedTotal) || money(g.OriginalTotal),
    beginningBalance: money(g.BeginningBalance),
  };
}

export async function listTransactionsPage(client, { postedAfter, nextToken }) {
  const data = await client.get("listTransactions", "/finances/2024-06-19/transactions", { postedAfter: postedAfter.toISOString(), nextToken });
  return {
    items: (Array.isArray(data?.payload?.transactions) ? data.payload.transactions : []).map(toSafeTransaction).filter(Boolean),
    nextToken: str(data?.payload?.nextToken, 4096),
  };
}

export async function listEventGroupsPage(client, { startedAfter, nextToken }) {
  const data = await client.get("listFinancialEventGroups", "/finances/v0/financialEventGroups", {
    MaxResultsPerPage: 100,
    FinancialEventGroupStartedAfter: startedAfter.toISOString(),
    NextToken: nextToken,
  });
  return {
    items: (Array.isArray(data?.payload?.FinancialEventGroupList) ? data.payload.FinancialEventGroupList : []).map(toSafeEventGroup).filter(Boolean),
    nextToken: str(data?.payload?.NextToken, 4096),
  };
}
