/**
 * Access-token issuing and verification.
 *
 * Tokens are HS256 JWTs signed with `JWT_SECRET`. Verification pins the algorithm, issuer and
 * audience, so a token minted by another service — or an unsecured `alg: none` token — is
 * rejected. Claims carry only the identity triple the authorization layer needs.
 */
import { Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { TypedConfigService } from '../config/configuration.js';
import {
  isUserRole,
  type AuthenticatedUser,
} from '../common/interfaces/authenticated-user.interface.js';
import { UnauthenticatedError } from '../common/errors/domain-error.js';

/** Claim names; `sub`/`iss`/`aud`/`iat`/`exp` follow RFC 7519. */
export interface AccessTokenClaims {
  sub: string;
  /** Tenant id — kept short because it travels on every request. */
  tid: string;
  email: string;
  role: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

export interface IssuedAccessToken {
  token: string;
  tokenType: 'Bearer';
  /** Lifetime in seconds, suitable for an OAuth-style `expires_in` response field. */
  expiresIn: number;
  /** Absolute expiry, useful for clients that cannot add seconds safely. */
  expiresAt: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: TypedConfigService,
  ) {}

  issue(user: AuthenticatedUser): IssuedAccessToken {
    const expiresIn = this.config.get('auth.accessTokenTtlSeconds', { infer: true });
    const options: JwtSignOptions = {
      algorithm: 'HS256',
      expiresIn,
      issuer: this.config.get('auth.issuer', { infer: true }),
      audience: this.config.get('auth.audience', { infer: true }),
    };

    const token = this.jwt.sign(
      {
        sub: user.userId,
        tid: user.tenantId,
        email: user.email,
        role: user.role,
      } satisfies AccessTokenClaims,
      options,
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    };
  }

  /**
   * Verify a bearer token and project it onto `AuthenticatedUser`.
   * Any failure (expired, wrong signature, wrong audience, malformed claims) becomes the same
   * generic `UnauthenticatedError`, so responses reveal nothing about why a token failed.
   */
  async verify(token: string): Promise<AuthenticatedUser> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ['HS256'],
        issuer: this.config.get('auth.issuer', { infer: true }),
        audience: this.config.get('auth.audience', { infer: true }),
      });
    } catch (error) {
      throw new UnauthenticatedError('The access token is missing, malformed or expired', {
        cause: error,
      });
    }

    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      typeof claims.tid !== 'string' ||
      claims.tid.length === 0 ||
      typeof claims.email !== 'string' ||
      !isUserRole(claims.role)
    ) {
      throw new UnauthenticatedError('The access token payload is missing required claims');
    }

    return {
      userId: claims.sub,
      tenantId: claims.tid,
      email: claims.email,
      role: claims.role,
    };
  }
}
