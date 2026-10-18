/** Select public order properties without exposing owner or persistence columns. */
export function serializeOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
