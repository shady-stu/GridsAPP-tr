import { z } from "zod";

/** Zod schemas define the runtime boundary for demo or future HTTP data. */
export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  company: z.string().min(1),
  joinedAt: z.iso.datetime(),
});

export const orderStatusSchema = z.enum([
  "processing",
  "shipped",
  "completed",
  "cancelled",
]);

export const orderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().nonnegative(),
  status: orderStatusSchema,
  createdAt: z.iso.datetime(),
});

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["order_created", "order_completed", "customer_added"]),
  message: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export const dashboardDataSchema = z.object({
  customers: z.array(customerSchema),
  orders: z.array(orderSchema),
  activity: z.array(activitySchema),
});

/** Browser form values start as strings and are parsed before becoming domain data. */
export const createOrderInputSchema = z.object({
  customerId: z.string().min(1, "Choose a customer."),
  description: z.string().trim().min(3, "Enter at least 3 characters."),
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount greater than zero.")
    .transform((value, context) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) {
        context.addIssue({
          code: "custom",
          message: "Enter an amount greater than zero.",
        });
        return z.NEVER;
      }
      return amount;
    }),
});

export type Customer = z.infer<typeof customerSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type DashboardData = z.infer<typeof dashboardDataSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
