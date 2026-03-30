// Example schema - in a real app this would use drizzle-orm
// For the POC, we just export table/column name constants

export const users = {
  tableName: "users",
  columns: {
    id: "id",
    name: "name",
    email: "email",
    createdAt: "created_at",
  },
} as const;

export const sessions = {
  tableName: "sessions",
  columns: {
    id: "id",
    userId: "user_id",
    expiresAt: "expires_at",
  },
} as const;
