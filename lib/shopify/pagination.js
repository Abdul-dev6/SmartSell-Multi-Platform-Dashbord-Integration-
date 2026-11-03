// Parses the REST `Link` header and returns the rel="next" URL, if any.
export function getNextPageUrl(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader
    .split(",")
    .find((link) => link.includes('rel="next"'));

  if (!nextLink) {
    return null;
  }

  return nextLink.split(";")[0].trim().replace(/^<|>$/g, "");
}
