/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Prisma 7 removed `datasource.url` from `schema.prisma`; the connection string for every
 * *CLI* command (`migrate`, `db`, `studio`, ...) is declared here instead. At runtime the
 * application never reads this file: it builds the URL from validated config and hands it to
 * the `@prisma/adapter-pg` driver adapter (see `src/database/prisma.service.ts`).
 *
 * `dotenv/config` is imported first so `.env` (gitignored, created from `.env.example`) is
 * loaded before the configuration object is evaluated.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * CLI fallback for a machine that has not created `.env` yet.
 *
 * It matches the throwaway cluster provisioned by `scripts/local-postgres.mjs` so that
 * `npm run prisma:generate` works out of the box. Migration commands still require a reachable
 * database, and the value is documented in `.env.example` and in the README.
 */
const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://orders:orders@127.0.0.1:55432/orders_dev';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `tsx` (dev-only) rather than `node --experimental-strip-types`: the Prisma 7 generated
    // client is TypeScript that imports its own modules with `.js` specifiers, which Node's
    // native type stripping does not rewrite to `.ts`. See the header of `prisma/seed.ts`.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
  },
});
