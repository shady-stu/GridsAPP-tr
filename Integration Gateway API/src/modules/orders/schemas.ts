import { z } from "zod";
import { uuidSchema } from "../../lib/schemas.js";

export const orderInputSchema = z
  .object({
    customerId: uuidSchema,
    totalCents: z.number().int().positive().max(100_000_000),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
  })
  .strict();

export const orderPatchSchema = z
  .object({
    status: z.enum(["pending", "paid", "cancelled", "refunded"]),
  })
  .strict();

export const orderIdParamsSchema = z.object({ id: uuidSchema });

export const orderListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  sort: z.enum(["createdAt", "totalCents", "status"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["pending", "paid", "cancelled", "refunded"]).optional(),
  customerId: uuidSchema.optional(),
});
