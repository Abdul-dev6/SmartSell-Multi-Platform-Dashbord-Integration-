import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { MAX_IMAGE_BYTES, uploadProductImage } from "@/lib/products/images";
import { productErrorResponse, productWriteLimit } from "@/lib/products/http";
import { toClientProduct } from "@/lib/products/service";

export const maxDuration = 60;

// Uploads one image (multipart/form-data field "image", optional "alt") to
// the user's Shopify product.
export async function POST(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    if (Number(req.headers.get("content-length") || 0) > MAX_IMAGE_BYTES + 64 * 1024) {
      return NextResponse.json(
        { success: false, code: "image_too_large", message: "Images must be 4 MB or smaller." },
        { status: 413 },
      );
    }

    let form;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ success: false, code: "invalid_upload", message: "Send the image as form data." }, { status: 400 });
    }

    const image = form.get("image");
    if (!image || typeof image === "string" || typeof image.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, code: "invalid_upload", message: "No image was attached." }, { status: 400 });
    }

    const { id } = await params;
    const result = await uploadProductImage(user._id, id, {
      buffer: Buffer.from(await image.arrayBuffer()),
      name: image.name,
      alt: form.get("alt"),
    });

    return NextResponse.json(
      { success: true, product: toClientProduct(result.product), mediaStatus: result.mediaStatus },
      { status: 201 },
    );
  } catch (error) {
    return productErrorResponse(error, "Upload product image", req);
  }
}
