// Asks for confirmation, then deletes the product from eBay (inventory item,
// offer and listing). SmartSell keeps an archived record.
// Returns { deleted: boolean, error?: string }.
export async function deleteEbayProductWithConfirm({ id, title }) {
  const confirmed = window.confirm(
    `Delete "${title}" from eBay?\n\nThis ends the eBay listing and deletes the inventory item and offer on your eBay account. SmartSell keeps an archived record.`,
  );
  if (!confirmed) return { deleted: false };

  try {
    const response = await fetch(`/api/ebay/products/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { deleted: false, error: data.message || "Delete failed." };
    return { deleted: true };
  } catch {
    return { deleted: false, error: "Could not reach the server." };
  }
}
