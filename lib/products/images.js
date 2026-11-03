import { createClient } from "@/lib/shopify/client";
import { assertNoUserErrors, productGid, shopifyGraphql } from "@/lib/shopify/graphql";
import {
  classifyFailure,
  findOwnedProduct,
  ProductServiceError,
  refreshFromShopify,
  requireStore,
} from "./service";

// Vercel rejects request bodies over ~4.5 MB, so images are capped below that.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Accepted types, identified by the file's leading bytes (not its name).
const SIGNATURES = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    mime: "image/webp",
    test: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
];

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer))?.mime || null;
}

// A safe file name for Shopify: letters, numbers, dashes; correct extension.
export function safeFilename(name, mime) {
  const base = String(name || "image")
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
  return `${base}.${EXTENSIONS[mime]}`;
}

const STAGED_UPLOAD = `
  mutation SmartSellStagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`;

const ATTACH_MEDIA = `
  mutation SmartSellAttachMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product { id media(first: 1, reverse: true) { nodes { id status } } }
      userErrors { field message }
    }
  }`;

// Uploads one image to Shopify and attaches it to the user's product.
// `file` is { buffer, name, alt }. Returns { product, mediaStatus }.
export async function uploadProductImage(userId, productId, file) {
  const mime = detectImageType(file.buffer);
  if (!mime) {
    throw new ProductServiceError(415, "unsupported_image", "Only JPEG, PNG, WebP or GIF images are supported.");
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new ProductServiceError(413, "image_too_large", "Images must be 4 MB or smaller.");
  }

  const product = await findOwnedProduct(userId, productId);
  if (!product || product.archivedAt || !product.shopifyProductId) {
    throw new ProductServiceError(404, "not_found", "Product not found.");
  }

  const store = await requireStore(userId, product.shopifyStore);
  const client = createClient(store.shop, store.accessToken);
  const filename = safeFilename(file.name, mime);
  const alt = typeof file.alt === "string" ? file.alt.trim().slice(0, 512) : "";

  try {
    // 1. Ask Shopify for a temporary upload target.
    const staged = await shopifyGraphql(
      client,
      STAGED_UPLOAD,
      {
        input: [
          { resource: "IMAGE", filename, mimeType: mime, httpMethod: "POST", fileSize: String(file.buffer.length) },
        ],
      },
      { idempotent: true },
    );
    const target = assertNoUserErrors(staged.stagedUploadsCreate, "stagedUploadsCreate").stagedTargets?.[0];
    if (!target?.url || !target?.resourceUrl) {
      throw new ProductServiceError(502, "shopify_error", "Shopify did not provide an upload target.");
    }

    // 2. Upload the bytes. The signed parameters must precede the file.
    const form = new FormData();
    for (const { name, value } of target.parameters) form.append(name, value);
    form.append("file", new Blob([file.buffer], { type: mime }), filename);
    const upload = await fetch(target.url, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!upload.ok) {
      throw new ProductServiceError(502, "upload_failed", `Image upload to Shopify storage failed (HTTP ${upload.status}).`);
    }

    // 3. Attach it to the product.
    const attached = await shopifyGraphql(client, ATTACH_MEDIA, {
      product: { id: productGid(product.shopifyProductId) },
      media: [{ originalSource: target.resourceUrl, mediaContentType: "IMAGE", alt }],
    });
    const payload = assertNoUserErrors(attached.productUpdate, "productUpdate");
    const mediaStatus = payload.product?.media?.nodes?.[0]?.status || null;

    // Shopify processes images asynchronously; the image appears locally once
    // processed (via the products/update webhook or the next sync).
    await refreshFromShopify(client, store, product.shopifyProductId).catch(() => {});

    return { product: await findOwnedProduct(userId, productId), mediaStatus };
  } catch (error) {
    if (error instanceof ProductServiceError) throw error;
    const outcome = classifyFailure(error);
    console.error("Image upload failed:", {
      outcome,
      code: error.code,
      status: error.response?.status,
      // GraphQL error text describes the request, not store data.
      graphql: error.errors?.map((e) => e.message).join("; ").slice(0, 300),
    });
    if (error?.code === "ACCESS_DENIED" || [401, 403].includes(error?.response?.status)) {
      throw new ProductServiceError(403, "missing_permission", "Shopify denied the image upload. Check the app's product permissions.");
    }
    if (error?.code === "USER_ERRORS") {
      throw new ProductServiceError(422, "shopify_validation", error.userErrors.map((e) => e.message).join("; "));
    }
    throw new ProductServiceError(502, "upload_failed", "The image could not be uploaded to Shopify. Try again.");
  }
}
