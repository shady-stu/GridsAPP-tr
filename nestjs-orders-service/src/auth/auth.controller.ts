/**
 * HTTP surface for authentication. No business rules live here: the controller validates the
 * request contract, delegates to `AuthService` and maps the result onto a response DTO.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorBodyDto } from '../common/dto/api-error.dto.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { AuthService } from './auth.service.js';
import { AccessTokenResponseDto } from './dto/access-token-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UserProfileDto } from './dto/user-profile.dto.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Credential endpoints are the classic brute-force target: throttle far below the global limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange credentials for an access token',
    description:
      'Verifies an email/password pair **within a tenant**. The response contains an HS256 JWT ' +
      'that must be sent as `Authorization: Bearer <token>` on every non-public endpoint.',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto, description: 'Credentials accepted.' })
  @ApiUnauthorizedResponse({
    type: ApiErrorBodyDto,
    description:
      'Credentials rejected (`UNAUTHENTICATED`). The same response is returned for an unknown ' +
      'tenant, unknown email, wrong password or deactivated user.',
  })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiTooManyRequestsResponse({ type: ApiErrorBodyDto, description: '`RATE_LIMITED`' })
  async login(@Body() body: LoginDto): Promise<AccessTokenResponseDto> {
    const issued = await this.auth.login({
      tenantSlug: body.tenantSlug,
      email: body.email,
      password: body.password,
    });

    return {
      accessToken: issued.token,
      tokenType: issued.tokenType,
      expiresIn: issued.expiresIn,
      expiresAt: issued.expiresAt,
    };
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Profile of the authenticated caller',
    description:
      'Resolves the identity from the verified access token only — never from query/body input.',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return UserProfileDto.from(await this.auth.getProfile(user));
  }
}
