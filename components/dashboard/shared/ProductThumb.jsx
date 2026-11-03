import Image from "next/image";
import { Package } from "lucide-react";

// Product image, or a neutral placeholder when Shopify has none.
export default function ProductThumb({ src, alt, size = 55, className = "" }) {
  if (src) {
    return <Image src={src} alt={alt || ""} width={size} height={size} className={`rounded-lg border object-cover ${className}`} />;
  }
  return (
    <span
      role="img"
      aria-label={`${alt || "Product"} (no image)`}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg border bg-slate-100 text-slate-400 ${className}`}
    >
      <Package size={Math.round(size * 0.45)} aria-hidden="true" />
    </span>
  );
}
