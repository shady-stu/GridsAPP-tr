/** Select public customer properties so database columns never leak into responses. */
export function serializeCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
