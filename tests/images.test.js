import zlib from "node:zlib";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Products";
import Shopifystore from "@/models/ShopifyUser";
import { linkStore } from "@/lib/Shopify/stores";
import { detectImageType, safeFilename } from "@/lib/products/images";
import { classifyFailure } from "@/lib/products/service";
import { ShopifyGraphQLError } from "@/lib/Shopify/graphql";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { fakeShopifyStore } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/Shopify/client", () => ({ createClient: () => shopify.current }));

const { createProduct } = await import("@/lib/products/service");
const { validateProductInput } = await import("@/lib/products/validation");
const { POST: upload } = await import("@/app/api/products/[id]/images/route");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), zlib.deflateSync(Buffer.alloc(64))]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(32)]);

describe("image checks", () => {
  it("identifies images by content, not name", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(WEBP)).toBe("image/webp");
    expect(detectImageType(Buffer.from("GIF89a" + "x".repeat(20)))).toBe("image/gif");
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>" + "x".repeat(20)))).toBeNull();
    expect(detectImageType(Buffer.from("not an image at all"))).toBeNull();
  });

  it("makes safe file names with the real extension", () => {
    expect(safeFilename("../../etc/passwd.png", "image/png")).toBe("etc-passwd.png");
    expect(safeFilename("My Photo (1).JPG", "image/jpeg")).toBe("My-Photo-1.jpg");
    expect(safeFilename("evil.php", "image/png")).toBe("evil.png");
    expect(safeFilename("", "image/webp")).toBe("image.webp");
  });
});

describe("failure classification", () => {
  it("GraphQL errors with mutation data mean the change may have been applied", () => {
    expect(classifyFailure(new ShopifyGraphQLError("x", { code: "ACCESS_DENIED" }))).toBe("rejected");
    expect(classifyFailure(new ShopifyGraphQLError("x", { code: "USER_ERRORS" }))).toBe("rejected");
    expect(classifyFailure(new ShopifyGraphQLError("x", { code: "GRAPHQL_ERROR", executed: true }))).toBe("unknown");
    expect(classifyFailure(Object.assign(new Error("x"), { response: { status: 503 } }))).toBe("unknown");
  });
});

describe("POST /api/products/[id]/images", () => {
  let fetchMock;
  let mediaCalls;

  beforeEach(async () => {
    await resetDatabase();
    await Promise.all([Product.syncIndexes(), Shopifystore.init()]);
    shopify.current = fakeShopifyStore();
    mediaCalls = [];
    const originalPost = shopify.current.post.bind(shopify.current);
    shopify.current.post = async (url, body) => {
      if (body.query.includes("stagedUploadsCreate")) {
        return {
          data: {
            data: {
              stagedUploadsCreate: {
                stagedTargets: [
                  {
                    url: "https://upload.example/bucket",
                    resourceUrl: "https://upload.example/bucket/key.png",
                    parameters: [
                      { name: "key", value: "tmp/key.png" },
                      { name: "policy", value: "p" },
                    ],
                  },
                ],
                userErrors: [],
              },
            },
          },
        };
      }
      if (body.query.includes("SmartSellAttachMedia")) {
        mediaCalls.push(body.variables);
        return {
          data: {
            data: {
              productUpdate: {
                product: { id: body.variables.product.id, media: { nodes: [{ id: "m1", status: "UPLOADED" }] } },
                userErrors: [],
              },
            },
          },
        };
      }
      return originalPost(url, body);
    };
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function setupProduct() {
    const user = await createUser();
    await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope: "write_products" });
    const value = validateProductInput({ idempotencyKey: "key-image-0001", title: "Mug", price: "1" }, { mode: "create" }).value;
    const { product } = await createProduct(user._id, value);
    return { user, product };
  }

  const send = (id, cookie, file, name = "photo.png", alt) => {
    const form = new FormData();
    if (file) form.append("image", new Blob([file]), name);
    if (alt) form.append("alt", alt);
    return upload(
      new NextRequest(`http://localhost:3000/api/products/${id}/images`, {
        method: "POST",
        body: form,
        headers: cookie ? { cookie } : {},
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
  };

  it("requires authentication", async () => {
    expect((await send("507f1f77bcf86cd799439011", null, PNG)).status).toBe(401);
  });

  it("uploads to the staged target, then attaches the media", async () => {
    const { user, product } = await setupProduct();
    const res = await send(product._id, sessionCookieFor(user), PNG, "My Photo.png", "Front view");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ success: true, mediaStatus: "UPLOADED" });

    // Signed parameters first, then the file, sent to the staged target.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://upload.example/bucket");
    expect([...init.body.keys()]).toEqual(["key", "policy", "file"]);
    expect(init.body.get("file").name).toBe("My-Photo.png");

    expect(mediaCalls[0].media).toEqual([
      { originalSource: "https://upload.example/bucket/key.png", mediaContentType: "IMAGE", alt: "Front view" },
    ]);
  });

  it("refuses non-images, oversized files and missing files without contacting Shopify", async () => {
    const { user, product } = await setupProduct();
    const cookie = sessionCookieFor(user);
    expect((await send(product._id, cookie, Buffer.from("<html>not an image</html>"), "x.png")).status).toBe(415);
    const big = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
    expect((await send(product._id, cookie, big)).status).toBe(413);
    expect((await send(product._id, cookie, null)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mediaCalls).toHaveLength(0);
  });

  it("another user's product is not found", async () => {
    const { product } = await setupProduct();
    const other = await createUser();
    expect((await send(product._id, sessionCookieFor(other), PNG)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed upload to storage and attaches nothing", async () => {
    const { user, product } = await setupProduct();
    fetchMock.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    const res = await send(product._id, sessionCookieFor(user), PNG);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("upload_failed");
    expect(mediaCalls).toHaveLength(0);
  });
});
