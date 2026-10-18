/**
 * NestJS-facing wrapper around the framework-free scrypt helpers in `password-hash.ts`.
 *
 * It exists for two reasons: services depend on an injectable `PasswordService` (so a test can
 * substitute a fast fake), and the crypto itself stays usable from the seed script and from
 * plain unit tests without booting a Nest container.
 *
 * The class deliberately declares **no constructor parameters**: `emitDecoratorMetadata` would
 * otherwise publish an interface type to the DI container. Code that needs non-default scrypt
 * parameters calls `hashPassword(plaintext, parameters)` directly.
 */
import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SCRYPT_PARAMETERS,
  hashPassword,
  verifyPassword,
  type ScryptParameters,
} from './password-hash.js';

export { DEFAULT_SCRYPT_PARAMETERS, hashPassword, verifyPassword };
export type { ScryptParameters };

@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return hashPassword(plaintext, DEFAULT_SCRYPT_PARAMETERS);
  }

  /** The parameter set is read back from the stored digest, so older hashes stay verifiable. */
  verify(plaintext: string, stored: string): Promise<boolean> {
    return verifyPassword(plaintext, stored);
  }
}
