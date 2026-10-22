/**
 * Authentication use cases: credential verification and access-token issuance.
 *
 * Security notes:
 *  * The same generic error is returned whether the tenant, the user or the password is wrong,
 *    so the endpoint cannot be used to enumerate accounts or tenants.
 *  * When the user does not exist we still run a `scrypt` verification against a throwaway
 *    hash, so a missing account and a wrong password take a comparable amount of time.
 *  * The password hash never leaves this service.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UnauthenticatedError } from '../common/errors/domain-error.js';
import { PasswordService } from './password.service.js';
import { TokenService, type IssuedAccessToken } from './token.service.js';
import { USER_REPOSITORY, type UserRepository } from './repositories/user.repository.js';
import type { UserRecord } from './entities/user.entity.js';

export interface LoginCommand {
  tenantSlug: string;
  email: string;
  password: string;
}

/** A valid-looking scrypt digest used only to equalise timing for unknown accounts. */
const TIMING_EQUALISATION_HASH =
  'scrypt$N=16384,r=8,p=1,len=64$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** Normalises the email so `User@Example.com` and `user@example.com` are the same account. */
  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async login(command: LoginCommand): Promise<IssuedAccessToken> {
    const email = AuthService.normaliseEmail(command.email);
    const credentials = await this.users.findCredentialsByTenantSlug(command.tenantSlug, email);

    if (!credentials) {
      // Burn comparable CPU time before failing, then fail with the same generic message.
      await this.passwords.verify(command.password, TIMING_EQUALISATION_HASH);
      this.logger.warn(`Failed login attempt for email in tenant "${command.tenantSlug}"`);
      throw new UnauthenticatedError('Invalid credentials');
    }

    const passwordMatches = await this.passwords.verify(command.password, credentials.passwordHash);
    if (!passwordMatches) {
      this.logger.warn(`Failed login attempt for user ${credentials.id}`);
      throw new UnauthenticatedError('Invalid credentials');
    }

    if (!credentials.isActive) {
      // Deliberately not distinguished from bad credentials in the response.
      this.logger.warn(`Login attempt for deactivated user ${credentials.id}`);
      throw new UnauthenticatedError('Invalid credentials');
    }

    const principal: AuthenticatedUser = {
      userId: credentials.id,
      tenantId: credentials.tenantId,
      email: credentials.email,
      role: credentials.role,
    };

    this.logger.log(`User ${credentials.id} authenticated in tenant ${credentials.tenantId}`);
    return this.tokens.issue(principal);
  }

  /** Profile of the caller, resolved from the token claims plus a tenant-scoped read. */
  async getProfile(principal: AuthenticatedUser): Promise<UserRecord> {
    const user = await this.users.findById(principal.tenantId, principal.userId);
    if (!user) {
      throw new UnauthenticatedError('The authenticated user no longer exists');
    }
    return user;
  }
}
