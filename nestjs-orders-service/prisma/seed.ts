/**
 * Development / demo seed.
 *
 * What it creates
 * ---------------
 * A small, fixed data set that the README and `docs/DEMO.md` refer to by name:
 *
 *   * two tenants          — `acme` and `globex` (tenant isolation is demonstrable out of the box)
 *   * three identities     — an ADMIN and a USER in `acme`, an ADMIN in `globex`
 *   * a handful of customers — so an order can be created without inventing data first
 *
 * What it deliberately does NOT create
 * ------------------------------------
 * Orders. Creating them exercises money handling, status transitions and (on the "paid" path)
 * the webhook processor; the demo scripts do that explicitly so the behaviour is observable
 * instead of pre-baked. A seeded order would also make `db:seed` non-idempotent in a way that is
 * hard to reason about.
 *
 * Idempotency
 * -----------
 * Every write is an `upsert` on a natural/compound unique key (`Tenant.slug`,
 * `User.tenantId_email`, `Customer.tenantId_email`), so running the seed twice is a no-op and
 * never fails on a unique-constraint violation. Passwords are only written on *create*: a
 * re-run must not silently reset a password an operator changed locally.
 *
 * How it is run
 * -------------
 * `npm run db:seed` (or `prisma db seed`, which is configured in `prisma.config.ts`). The runner
 * is `tsx` rather than `node --experimental-strip-types`: the Prisma 7 generated client is
 * emitted as TypeScript whose internal imports use `.js` specifiers, and Node's built-in type
 * stripping does not rewrite `.js` -> `.ts`. `tsx` does, so the seed can import the very same
 * `client.ts` the application uses. No application code depends on `tsx`; it is a dev-only tool.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password-hash.js';
import type { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Mirrors the CLI fallback in `prisma.config.ts` so the seed and `prisma migrate` always agree
 * on which database they are talking to, even without a `.env` file.
 */
const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://orders:orders@127.0.0.1:55432/orders_dev';

/** The shared demo password. Documented in the README; never used outside local development. */
const DEMO_PASSWORD = 'Passw0rd!demo';

interface SeedTenant {
  slug: string;
  name: string;
  users: Array<{ email: string; displayName: string; role: UserRole }>;
  customers: Array<{ name: string; email: string; phone?: string; notes?: string; isActive?: boolean }>;
}

const TENANTS: SeedTenant[] = [
  {
    slug: 'acme',
    name: 'Acme Ltd',
    users: [
      { email: 'admin@acme.test', displayName: 'Acme Administrator', role: 'ADMIN' },
      { email: 'agent@acme.test', displayName: 'Acme Support Agent', role: 'USER' },
    ],
    customers: [
      {
        name: 'Ada Lovelace',
        email: 'ada@acme.test',
        phone: '+44 20 7946 0958',
        notes: 'Prefers e-mail contact.',
      },
      { name: 'Grace Hopper', email: 'grace@acme.test', phone: '+1 202 555 0143' },
      {
        name: 'Alan Turing',
        email: 'alan@acme.test',
        notes: 'Deactivated on purpose so the "cannot order for a deactivated customer" rule is demoable.',
        isActive: false,
      },
    ],
  },
  {
    slug: 'globex',
    name: 'Globex Corporation',
    users: [{ email: 'admin@globex.test', displayName: 'Globex Administrator', role: 'ADMIN' }],
    customers: [{ name: 'Hank Scorpio', email: 'hank@globex.test' }],
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Hash once and share: the demo password is identical for every seeded identity, and each
    // scrypt call costs ~50ms of CPU. Different salts are irrelevant when the plaintext matches.
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const credentials: Array<{ tenant: string; email: string; role: UserRole }> = [];

    for (const tenant of TENANTS) {
      const tenantRow = await prisma.tenant.upsert({
        where: { slug: tenant.slug },
        update: { name: tenant.name },
        create: { slug: tenant.slug, name: tenant.name },
      });

      for (const user of tenant.users) {
        await prisma.user.upsert({
          where: { tenantId_email: { tenantId: tenantRow.id, email: user.email } },
          // Do not reset a password that may have been changed locally since the last seed.
          update: { displayName: user.displayName, role: user.role },
          create: {
            tenantId: tenantRow.id,
            email: user.email,
            displayName: user.displayName,
            passwordHash,
            role: user.role,
          },
        });
        credentials.push({ tenant: tenant.slug, email: user.email, role: user.role });
      }

      for (const customer of tenant.customers) {
        await prisma.customer.upsert({
          where: { tenantId_email: { tenantId: tenantRow.id, email: customer.email } },
          update: {
            name: customer.name,
            phone: customer.phone ?? null,
            notes: customer.notes ?? null,
            isActive: customer.isActive ?? true,
          },
          create: {
            tenantId: tenantRow.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone ?? null,
            notes: customer.notes ?? null,
            isActive: customer.isActive ?? true,
          },
        });
      }

      console.log(
        `seeded tenant "${tenant.slug}" (${tenant.users.length} user(s), ${tenant.customers.length} customer(s))`,
      );
    }

    console.log('\nDemo credentials (password for every account: %s)\n', DEMO_PASSWORD);
    console.table(credentials);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
