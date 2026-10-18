import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().default("./data/integration-gateway.sqlite"),
  ADMIN_API_TOKEN: z.string().min(24),
  CUSTOMER_API_TOKEN: z.string().min(24),
  WEBHOOK_SECRET: z.string().min(24),
  WEBHOOK_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(300),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
});

// Validate configuration before opening a listener or database, and never log values.
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}
export const config = parsed.data;
export type Config = typeof config;
