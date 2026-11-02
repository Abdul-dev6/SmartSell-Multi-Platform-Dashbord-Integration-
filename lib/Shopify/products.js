import { getNextPageUrl } from "./pagination";

export async function Getproducts(client, nextPageUrl = null) {
  const url = nextPageUrl || "/products.json";

  const response = await client.get(url, {
    params: nextPageUrl
      ? {}
      : {
          limit: 250,
        },
  });

  const products = response.data.products;

  const nextUrl = getNextPageUrl(response.headers.link);

  return {
    products,
    nextUrl,
  };
}
