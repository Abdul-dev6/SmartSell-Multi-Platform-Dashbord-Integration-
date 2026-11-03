// What a store's granted OAuth scopes allow. Shopify reports only the write
// scope when both were granted (write_X implies read_X).

export function grantedScopes(store) {
  return new Set(
    String(store?.scope || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function hasScope(store, scope) {
  const granted = grantedScopes(store);
  if (granted.has(scope)) return true;
  return scope.startsWith("read_") && granted.has(`write_${scope.slice(5)}`);
}

// Sales channels (publications): listing them and reading where a product is
// published needs read_publications; publishing/unpublishing needs
// write_publications (publishablePublish / publishableUnpublish).
export const PUBLICATION_SCOPES = ["read_publications", "write_publications"];

export const canReadPublications = (store) => hasScope(store, "read_publications");
export const canManagePublications = (store) => hasScope(store, "write_publications");

export function missingPublicationScopes(store) {
  return PUBLICATION_SCOPES.filter((scope) => !hasScope(store, scope));
}
