// Error text for a failed API response. Server errors (5xx) get the
// request's reference ID, which matches the server log entry for it.
export function apiErrorText(response, data, fallback = "Request failed.") {
  const text = data?.message || fallback;
  const reference = response?.status >= 500 ? response.headers?.get?.("x-request-id") : null;
  return reference ? `${text} (Reference: ${reference})` : text;
}
