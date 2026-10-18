/**
 * Password hashing with Node's built-in `scrypt`.
 *
 * Why not bcrypt/argon2? Both are native addons: they need a compiler toolchain at install time
 * and complicate ESM/CI environments. `crypto.scrypt` is a memory-hard KDF available in the
 * standard library, is well suited to password storage, and keeps the dependency surface (and
 * therefore the attack surface) small.
 *
 * Stored format (self-describing, so parameters can be raised later without a migration):
 *
 * ```
 * scrypt$N=16384,r=8,p=1,len=64$<base64 salt>$<base64 derived key>
 * ```
 *
 * This module is deliberately free of NestJS imports: the seed script and unit tests use the
 * same functions, and the framework wrapper (`PasswordService`) adds nothing but `@Injectable()`.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` only infers the 3-argument overload of `crypto.scrypt`, which would make the
 * `options` argument (N/r/p/maxmem) a type error. Re-declaring the signature keeps the call site
 * checked while still using the promisified implementation.
 */
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export interface ScryptParameters {
  /** CPU/memory cost. 16384 keeps hashing ~30-60ms on a typical developer machine. */
  N: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
}

export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  N: 16_384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
};

const SALT_BYTES = 16;

/** Hash a plaintext password with fresh random salt. Returns the self-describing digest. */
export async function hashPassword(
  plaintext: string,
  parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(plaintext, salt, parameters);
  return [
    'scrypt',
    `N=${parameters.N},r=${parameters.blockSize},p=${parameters.parallelization},len=${parameters.keyLength}`,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns `false` for malformed stored values instead of throwing,
 * so a corrupt row can never turn into a 500 on the login endpoint. The plaintext password is
 * never logged, persisted or included in an error.
 */
export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;

  try {
    const derived = await derive(plaintext, parsed.salt, parsed.parameters);
    if (derived.length !== parsed.derived.length) return false;
    return timingSafeEqual(derived, parsed.derived);
  } catch {
    return false;
  }
}

async function derive(
  plaintext: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  // NFKC normalisation keeps visually identical passwords (different Unicode compositions)
  // verifiable across clients.
  return (await scrypt(plaintext.normalize('NFKC'), salt, parameters.keyLength, {
    N: parameters.N,
    r: parameters.blockSize,
    p: parameters.parallelization,
    // scrypt refuses to allocate beyond this; keep a sane ceiling for the parameters we use.
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
}

function parseStoredHash(
  stored: string,
): { parameters: ScryptParameters; salt: Buffer; derived: Buffer } | undefined {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return undefined;

  const options = new Map<string, number>();
  for (const pair of parts[1]!.split(',')) {
    const [key, value] = pair.split('=');
    const parsed = Number.parseInt(value ?? '', 10);
    if (key === undefined || !Number.isFinite(parsed)) return undefined;
    options.set(key, parsed);
  }

  const N = options.get('N');
  const blockSize = options.get('r');
  const parallelization = options.get('p');
  const keyLength = options.get('len');
  if (
    N === undefined ||
    blockSize === undefined ||
    parallelization === undefined ||
    keyLength === undefined
  ) {
    return undefined;
  }

  return {
    parameters: { N, blockSize, parallelization, keyLength },
    salt: Buffer.from(parts[2]!, 'base64'),
    derived: Buffer.from(parts[3]!, 'base64'),
  };
}
