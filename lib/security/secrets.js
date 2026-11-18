// AES-256-GCM encryption for marketplace tokens at rest (TOKEN_ENCRYPTION_KEY).
// One implementation, shared: it lives with the eBay integration, which
// introduced it, and is re-exported here for the other marketplaces.
export { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/ebay/crypto";
