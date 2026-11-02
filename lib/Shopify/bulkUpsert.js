// Filter fragment that only matches when the stored copy is not newer than
// `incoming` (or has no timestamp yet). Used so an older Shopify payload never
// overwrites a newer one, whatever order syncs and webhooks arrive in.
export function notNewerThan(field, incoming) {
  if (!incoming) {
    return {};
  }
  return { $or: [{ [field]: { $lte: incoming } }, { [field]: null }] };
}

// Runs upsert operations in one round trip.
//
// When the stored record is newer, the guarded filter does not match, the
// upsert tries to insert, and the unique index rejects it (E11000). Those
// rejections are expected and counted as `skippedStale`; any other error is
// thrown.
export async function bulkUpsert(Model, ops) {
  const summary = { inserted: 0, updated: 0, skippedStale: 0 };
  if (!ops.length) {
    return summary;
  }

  let result;
  try {
    result = await Model.bulkWrite(ops, { ordered: false });
  } catch (error) {
    const writeErrors = error.writeErrors || [];
    const onlyDuplicates =
      writeErrors.length > 0 &&
      writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    if (!onlyDuplicates) {
      throw error;
    }
    result = error.result;
    summary.skippedStale = writeErrors.length;
  }

  summary.inserted = result?.upsertedCount ?? 0;
  summary.updated = result?.matchedCount ?? 0;
  return summary;
}
