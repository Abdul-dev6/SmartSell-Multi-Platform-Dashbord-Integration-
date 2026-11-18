// Removes buyer-like fields from an SP-API response before it is shown in
// the Sandbox Data Viewer's raw JSON. SmartSell never requests buyer data;
// this is a second guard so a raw response can never display any.
const BUYER_KEY = /buyer|recipient|email|phone|shippingaddress|billingaddress/i;

export function redactBuyerFields(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map((v) => redactBuyerFields(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !BUYER_KEY.test(key))
        .map(([key, v]) => [key, redactBuyerFields(v, depth + 1)]),
    );
  }
  return value;
}
