import { z } from "zod";
import { uuidSchema } from "../../lib/schemas.js";

export const paymentStatusEventSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.literal("payment.status_changed"),
    data: z
      .object({
        orderId: uuidSchema,
        status: z.enum(["pending", "paid", "cancelled", "refunded"]),
      })
      .strict(),
  })
  .strict();

export type PaymentStatusEvent = z.infer<typeof paymentStatusEventSchema>;
