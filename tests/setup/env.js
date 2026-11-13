import crypto from "node:crypto";
import { inject } from "vitest";

// Test-only values. Real secrets are never loaded in tests.
// Each test file gets its own database so parallel files cannot interfere.
const baseUri = inject("mongoUri").replace(/\/$/, "");
process.env.MONGODB_URI = `${baseUri}/smartsell-test-${crypto.randomUUID()}`;
process.env.JWT_SECRET = "test-jwt-secret";
process.env.SHOPIFY_CLIENT_ID = "test-client-id";
process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
process.env.SHOPIFY_REDIRECT_URI = "http://localhost:3000/api/shopify/callback";
process.env.SHOPIFY_SCOPES = "read_products, write_products";
// eBay Sandbox test values (never real credentials).
process.env.EBAY_ENVIRONMENT = "sandbox";
process.env.EBAY_SANDBOX_CLIENT_ID = "test-ebay-client-id";
process.env.EBAY_SANDBOX_CLIENT_SECRET = "test-ebay-client-secret";
process.env.EBAY_SANDBOX_RU_NAME = "Test-RuName-SmartSell";
process.env.EBAY_MARKETPLACE_ID = "EBAY_US";
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
delete process.env.EBAY_SCOPES;
