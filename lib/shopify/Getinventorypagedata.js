import { Getproducts } from "@/lib/shopify/products";
import { Getinventory } from "@/lib/shopify/inventory";

export async function getInventoryPageData(client) {
  // 1. Get all products with their variants
  const productData = await Getproducts(client);
  const products = productData.products;

  // 2. Get inventory_item_id from every variant
  const inventoryItemIds = products.flatMap((product) =>
    product.variants
      .map((variant) => variant.inventory_item_id)
      .filter(Boolean)
  );

  // 3. Get inventory using those IDs
  const inventory = inventoryItemIds.length
    ? await Getinventory(client, inventoryItemIds)
    : [];

  // 4. Combine inventory + variant + product
  const inventoryData = inventory.map((item) => {
    // Find product containing this inventory item
    const product = products.find((product) =>
      product.variants.some(
        (variant) =>
          variant.inventory_item_id &&
          String(variant.inventory_item_id) ===
          String(item.inventory_item_id)
      )
    );

    // Find exact variant
    const variant = product?.variants.find(
      (variant) =>
        String(variant.inventory_item_id) ===
        String(item.inventory_item_id)
    );

    return {
      // Inventory
      inventory_item_id: item.inventory_item_id,
      location_id: item.location_id,
      available: item.available,
      updated_at: item.updated_at,

      // Product
      product_id: product?.id,
      title: product?.title,
      status: product?.status,

      // Image
      image: product?.images?.[0]?.src || null,
      
      // Variant
      variant_id: variant?.id,
      variant_title: variant?.title,
      price: variant?.price || null,
      sku:
        variant?.sku?.trim() ||
        variant?.barcode ||
        `SHOPIFY-${variant?.id || item.inventory_item_id}`,
      platform: "Shopify",
      

    };
  });

  return inventoryData;
}