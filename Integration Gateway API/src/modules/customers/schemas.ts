import { z } from "zod";
import { uuidSchema } from "../../lib/schemas.js";

export const customerInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
  })
  .strict();

export const customerPatchSchema = customerInputSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export const customerIdParamsSchema = z.object({ id: uuidSchema });

export const customerListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  sort: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().max(120).optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
