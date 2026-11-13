import EbayAccount from "@/models/EbayAccount";
import { createEbayClient, EbayApiError } from "@/lib/ebay/client";

// Listing prerequisites on the seller's eBay account. Publishing an offer
// needs a fulfillment, payment and return business policy and an inventory
// location (merchantLocationKey). SmartSell reads them, lets the seller pick,
// and can create simple defaults when the account has none.

const ACCOUNT_API = "/sell/account/v1";
const INVENTORY_API = "/sell/inventory/v1";
// eBay: "User is not eligible for Business Policy" (not opted in).
const NOT_OPTED_IN_ERROR_IDS = new Set([20403]);
const LOCATION_KEY_RE = /^[A-Za-z0-9_-]{1,36}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

// Shipping services SmartSell can use for a default fulfillment policy.
const DEFAULT_SHIPPING = {
  EBAY_US: { carrier: "USPS", service: "USPSPriority" },
  EBAY_GB: { carrier: "RoyalMail", service: "UK_RoyalMailFirstClassStandard" },
  EBAY_DE: { carrier: "DHL", service: "DE_DHLPaket" },
};

export const ISSUE_MESSAGES = {
  business_policies_not_enabled: "Business policies are not enabled on this eBay account.",
  missing_fulfillment_policy: "No shipping (fulfillment) policy found.",
  missing_payment_policy: "No payment policy found.",
  missing_return_policy: "No return policy found.",
  missing_location: "No inventory location found.",
};

function appliesToGoods(policy) {
  const types = policy.categoryTypes || [];
  return !types.length || types.some((t) => t.name === "ALL_EXCLUDING_MOTORS_VEHICLES");
}

function pickPolicy(policies, currentId) {
  const usable = policies.filter(appliesToGoods);
  return (
    usable.find((p) => p.id === currentId) ||
    usable.find((p) => (p.categoryTypes || []).some((t) => t.default)) ||
    usable[0] ||
    null
  );
}

function isNotOptedIn(error) {
  return error instanceof EbayApiError && error.errors.some((e) => NOT_OPTED_IN_ERROR_IDS.has(Number(e.errorId)));
}

async function readPolicies(client, kind) {
  const idField = { fulfillment: "fulfillmentPolicyId", payment: "paymentPolicyId", return: "returnPolicyId" }[kind];
  const listField = { fulfillment: "fulfillmentPolicies", payment: "paymentPolicies", return: "returnPolicies" }[kind];
  const data = await client.get(`${ACCOUNT_API}/${kind}_policy`, { query: { marketplace_id: client.marketplace.id } });
  return (data?.[listField] || []).map((p) => ({ id: String(p[idField]), name: p.name, categoryTypes: p.categoryTypes || [] }));
}

async function readLocations(client) {
  const data = await client.get(`${INVENTORY_API}/location`, { query: { limit: 100 } });
  return (data?.locations || [])
    .filter((l) => (l.merchantLocationStatus || "ENABLED") === "ENABLED")
    .map((l) => ({
      key: l.merchantLocationKey,
      name: l.name || l.merchantLocationKey,
      country: l.location?.address?.country || null,
    }));
}

// Reads policies and locations, keeps the seller's current choices when they
// still exist, and stores the result on the account.
export async function checkEbaySetup(account, { client = createEbayClient(account) } = {}) {
  const current = account.setup || {};
  const issues = [];
  let fulfillment = [];
  let payment = [];
  let returns = [];
  try {
    [fulfillment, payment, returns] = await Promise.all([
      readPolicies(client, "fulfillment"),
      readPolicies(client, "payment"),
      readPolicies(client, "return"),
    ]);
  } catch (error) {
    if (!isNotOptedIn(error)) throw error;
    issues.push("business_policies_not_enabled");
  }
  const locations = await readLocations(client);

  const chosen = {
    fulfillment: pickPolicy(fulfillment, current.fulfillmentPolicyId),
    payment: pickPolicy(payment, current.paymentPolicyId),
    return: pickPolicy(returns, current.returnPolicyId),
    location: locations.find((l) => l.key === current.merchantLocationKey) || locations[0] || null,
  };
  if (!issues.length) {
    if (!chosen.fulfillment) issues.push("missing_fulfillment_policy");
    if (!chosen.payment) issues.push("missing_payment_policy");
    if (!chosen.return) issues.push("missing_return_policy");
  }
  if (!chosen.location) issues.push("missing_location");

  const setup = {
    checkedAt: new Date(),
    ready: issues.length === 0,
    merchantLocationKey: chosen.location?.key || undefined,
    fulfillmentPolicyId: chosen.fulfillment?.id || undefined,
    paymentPolicyId: chosen.payment?.id || undefined,
    returnPolicyId: chosen.return?.id || undefined,
    policyNames: {
      fulfillment: chosen.fulfillment?.name || undefined,
      payment: chosen.payment?.name || undefined,
      return: chosen.return?.name || undefined,
    },
    issues,
  };
  await EbayAccount.updateOne({ _id: account._id }, { $set: { setup } });
  account.setup = setup;

  const usable = (list) => list.filter(appliesToGoods).map(({ id, name }) => ({ id, name }));
  return {
    setup,
    options: {
      fulfillment: usable(fulfillment),
      payment: usable(payment),
      return: usable(returns),
      locations,
    },
    canCreateDefaultPolicies: Boolean(DEFAULT_SHIPPING[client.marketplace.id]),
  };
}

// Asks eBay to enable business policies (SELLING_POLICY_MANAGEMENT).
export async function optInToBusinessPolicies(account, { client = createEbayClient(account) } = {}) {
  try {
    await client.post(`${ACCOUNT_API}/program/opt_in`, { programType: "SELLING_POLICY_MANAGEMENT" });
  } catch (error) {
    // Already opted in.
    if (!(error instanceof EbayApiError && error.status === 409)) throw error;
  }
}

// Creates any missing policy with simple defaults: free domestic shipping,
// 1-day handling, 30-day buyer-paid returns, eBay managed payments.
export async function createDefaultPolicies(account, { client = createEbayClient(account) } = {}) {
  const marketplaceId = client.marketplace.id;
  const shipping = DEFAULT_SHIPPING[marketplaceId];
  if (!shipping) {
    throw new EbayApiError({ code: "unsupported_marketplace", message: "Create business policies in your eBay account for this marketplace." });
  }
  const categoryTypes = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];
  const setup = account.setup || {};
  const created = [];

  if (!setup.paymentPolicyId) {
    await client.post(`${ACCOUNT_API}/payment_policy`, {
      name: "SmartSell payment",
      marketplaceId,
      categoryTypes,
      immediatePay: true,
    });
    created.push("payment");
  }
  if (!setup.returnPolicyId) {
    await client.post(`${ACCOUNT_API}/return_policy`, {
      name: "SmartSell 30-day returns",
      marketplaceId,
      categoryTypes,
      returnsAccepted: true,
      returnPeriod: { value: 30, unit: "DAY" },
      refundMethod: "MONEY_BACK",
      returnShippingCostPayer: "BUYER",
    });
    created.push("return");
  }
  if (!setup.fulfillmentPolicyId) {
    await client.post(`${ACCOUNT_API}/fulfillment_policy`, {
      name: "SmartSell free shipping",
      marketplaceId,
      categoryTypes,
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              sortOrder: 1,
              shippingCarrierCode: shipping.carrier,
              shippingServiceCode: shipping.service,
              freeShipping: true,
              shippingCost: { value: "0.0", currency: client.marketplace.currency },
            },
          ],
        },
      ],
    });
    created.push("fulfillment");
  }
  return created;
}

export function validateLocationInput(input) {
  const errors = {};
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const value = {
    key: str(input?.key, 36) || "smartsell-default",
    name: str(input?.name, 100) || "SmartSell warehouse",
    addressLine1: str(input?.addressLine1, 128),
    city: str(input?.city, 128),
    stateOrProvince: str(input?.stateOrProvince, 128),
    postalCode: str(input?.postalCode, 32),
    country: str(input?.country, 2).toUpperCase(),
  };
  if (!LOCATION_KEY_RE.test(value.key)) errors.key = "Use letters, numbers, - or _ (max 36)";
  if (!COUNTRY_RE.test(value.country)) errors.country = "Use a 2-letter country code, e.g. US";
  // eBay needs a postal code, or a city with a state/province.
  if (!value.postalCode && !(value.city && value.stateOrProvince)) {
    errors.postalCode = "Enter a postal code, or a city and state";
  }
  return { value, errors };
}

export async function createInventoryLocation(account, value, { client = createEbayClient(account) } = {}) {
  await client.post(`${INVENTORY_API}/location/${encodeURIComponent(value.key)}`, {
    name: value.name,
    merchantLocationStatus: "ENABLED",
    locationTypes: ["WAREHOUSE"],
    location: {
      address: {
        ...(value.addressLine1 ? { addressLine1: value.addressLine1 } : {}),
        ...(value.city ? { city: value.city } : {}),
        ...(value.stateOrProvince ? { stateOrProvince: value.stateOrProvince } : {}),
        ...(value.postalCode ? { postalCode: value.postalCode } : {}),
        country: value.country,
      },
    },
  });
}

// Stores the seller's choice; ids must come from checkEbaySetup's options.
export async function selectSetup(account, choice, options) {
  const setup = account.setup || {};
  const pick = (list, id, field) => {
    if (id === undefined) return setup[field];
    return list.some((o) => o.id === id || o.key === id) ? id : null;
  };
  const next = {
    fulfillmentPolicyId: pick(options.fulfillment, choice.fulfillmentPolicyId, "fulfillmentPolicyId"),
    paymentPolicyId: pick(options.payment, choice.paymentPolicyId, "paymentPolicyId"),
    returnPolicyId: pick(options.return, choice.returnPolicyId, "returnPolicyId"),
    merchantLocationKey: pick(options.locations, choice.merchantLocationKey, "merchantLocationKey"),
  };
  if (Object.values(next).some((v) => v === null)) return false;
  await EbayAccount.updateOne(
    { _id: account._id },
    { $set: Object.fromEntries(Object.entries(next).map(([k, v]) => [`setup.${k}`, v])) },
  );
  Object.assign(account.setup, next);
  return true;
}
