// npm run amazon:sandbox-check
//
// Optional live check of the Amazon SP-API STATIC SANDBOX with the sandbox
// credentials in .env (AMAZON_SANDBOX_CLIENT_ID, _CLIENT_SECRET,
// _REFRESH_TOKEN). Runs the official static-sandbox examples through the
// real SmartSell modules (LWA, client, mappers) and prints the mapped,
// privacy-safe results.
//
//   - Sandbox only: refuses unless AMAZON_ENVIRONMENT is "sandbox" (default),
//     and the client refuses any host but the sandbox endpoint.
//   - Never touches the database (no DB module is imported, and
//     MONGODB_URI is removed from this process).
//   - Prints no tokens or secrets.
//   - Orders is skipped: every official static example for Orders
//     2026-01-01 requests BUYER/RECIPIENT data, which SmartSell never does.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAmazonConfig, getAmazonEnvironment, missingAmazonSettings } from "@/lib/amazon/config";
import { createAmazonClient } from "@/lib/amazon/client";
import { getMarketplaceParticipations } from "@/lib/amazon/sellers";
import { getListingsItem } from "@/lib/amazon/listings";

try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
} catch {
  // No .env: rely on the shell environment.
}
delete process.env.MONGODB_URI;

const environment = getAmazonEnvironment(); // throws unless sandbox
const missing = missingAmazonSettings();
const config = missing.length ? null : getAmazonConfig();
const SKU = "GM-ZDPI-9B4E"; // SKU from the official getListingsItem example

const print = (label, value) => console.log(`\n${label}\n${JSON.stringify(value, null, 2)}`);

describe(`Amazon SP-API static sandbox (${environment})`, () => {
  it.skipIf(!config)(`credentials present${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`, () => {
    expect(config.apiBase).toBe("https://sandbox.sellingpartnerapi-na.amazon.com");
  });

  it.skipIf(!config)("Sellers getMarketplaceParticipations", async () => {
    const client = createAmazonClient(config);
    const participations = await getMarketplaceParticipations(client);
    print("getMarketplaceParticipations (mapped):", participations);
    expect(participations.length).toBeGreaterThan(0);
  });

  it.skipIf(!config)("Listings Items getListingsItem", async () => {
    const client = createAmazonClient(config);
    const listing = await getListingsItem(client, {
      sellerId: config.sellingPartnerId || "SANDBOX_SELLER",
      sku: SKU,
      marketplaceId: config.marketplaceIds[0],
    });
    print("getListingsItem (mapped):", listing);
    expect(listing?.sku).toBe(SKU);
  });

  it.skip("Orders 2026-01-01: skipped, no privacy-safe static example (all request BUYER/RECIPIENT)", () => {});
});
