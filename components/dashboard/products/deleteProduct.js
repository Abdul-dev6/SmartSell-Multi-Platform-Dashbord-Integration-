// Asks for confirmation, then deletes the product in Shopify (SmartSell keeps
// an archived record). Returns { deleted: boolean, error?: string }.
export async function deleteProductWithConfirm({ id, title }) {
  const confirmed = window.confirm(
    `Delete "${title}" from Shopify?\n\nThis permanently deletes the product (all its variants) in your Shopify store. SmartSell keeps an archived record so order history stays intact.`,
  );
  if (!confirmed) return { deleted: false };

  try {
    const response = await fetch(`/api/products/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { deleted: false, error: data.message || "Delete failed." };
    return { deleted: true };
  } catch {
    return { deleted: false, error: "Could not reach the server." };
  }
}

// Links into the store's Shopify admin.
export const shopifyAdminUrl = {
  product: (shop, productId) => (shop && productId ? `https://${shop}/admin/products/${productId}` : null),
  variant: (shop, productId, variantId) =>
    shop && productId && variantId ? `https://${shop}/admin/products/${productId}/variants/${variantId}` : null,
  inventory: (shop) => (shop ? `https://${shop}/admin/products/inventory` : null),
};
