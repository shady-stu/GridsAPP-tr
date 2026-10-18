/**
 * HTTP surface for webhooks.
 *
 * `POST /webhooks/payments` is unauthenticated by design (`@Public()`): the caller is a payment
 * provider, not a user. Authentication is replaced by the HMAC signature check, which is
 * strictly stronger here — it authenticates the *bytes* of the request, not a bearer token that
 * could be replayed against other endpoints.
 *
 * Response codes:
 *  * `202 Accepted` — the event is new and durably stored, awaiting processing.
 *  * `200 OK`       — the event id was already stored (idempotent redelivery).
 *  * `401`          — signature missing/malformed/mismatching.
 *  * `400`          — timestamp outside the tolerance window, or an invalid envelope.
 *
 * The body pipe for this one route disables `whitelist`, so unknown fields a provider adds are
 * preserved in the stored payload instead of being silently dropped. Every other route keeps the
 * global, whitelisting pipe.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
// `RawBodyRequest` is a generic *type*; with `isolatedModules` + `emitDecoratorMetadata` a type
// used in a decorated signature must be imported with `import type` (TS1272).
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { WEBHOOK_SIGNATURE_HEADER } from '../common/constants.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorBodyDto } from '../common/dto/api-error.dto.js';
import { PaymentWebhookEnvelopeDto } from './dto/payment-webhook.dto.js';
import { WebhookAcceptedDto } from './dto/webhook-accepted.dto.js';
import { WebhookEventSummaryDto } from './dto/webhook-event-summary.dto.js';
import { WebhookInboxService } from './webhook-inbox.service.js';
import { WebhookProcessorService } from './webhook-processor.service.js';

/**
 * Preserves unknown fields, unlike the global pipe: the stored payload is evidence, so it must
 * be exactly what the provider sent.
 */
const RAW_WEBHOOK_BODY_PIPE = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@ApiTags('webhooks')
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  constructor(
    private readonly inbox: WebhookInboxService,
    private readonly processor: WebhookProcessorService,
  ) {}

  @Post('payments')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  // Providers may deliver bursts after an outage; allow far more than the global API limit.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Receive a payment provider webhook',
    description:
      'Verifies the HMAC-SHA256 signature over the raw request body, then stores the event in ' +
      'the durable inbox. Idempotent: replaying the same `id` returns 200 without re-processing. ' +
      'Processing happens asynchronously (see `POST /webhooks/events/process`).',
  })
  @ApiHeader({
    name: WEBHOOK_SIGNATURE_HEADER,
    required: true,
    description:
      'Stripe-style signature: `t=<unix-seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.',
    example: 't=1767182400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd',
  })
  @ApiBody({ type: PaymentWebhookEnvelopeDto })
  @ApiAcceptedResponse({
    type: WebhookAcceptedDto,
    description: 'New event stored; processing is asynchronous.',
  })
  @ApiOkResponse({ type: WebhookAcceptedDto, description: 'Duplicate delivery, acknowledged.' })
  @ApiUnauthorizedResponse({
    type: ApiErrorBodyDto,
    description: '`INVALID_SIGNATURE` — signature missing, malformed or mismatching.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorBodyDto,
    description: '`STALE_WEBHOOK_EVENT` (timestamp outside tolerance) or `VALIDATION_FAILED`.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorBodyDto, description: '`RATE_LIMITED`' })
  async receivePaymentEvent(
    @Req() request: RawBodyRequest<Request>,
    @Headers(WEBHOOK_SIGNATURE_HEADER) signature: string | undefined,
    @Body(RAW_WEBHOOK_BODY_PIPE) envelope: PaymentWebhookEnvelopeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebhookAcceptedDto> {
    const accepted = await this.inbox.accept({
      rawBody: request.rawBody,
      signatureHeader: signature,
      envelope,
    });

    // 202 = "new work accepted"; 200 = "already seen, nothing to do". Both mean success to the
    // provider, which is what stops it retrying forever.
    response.status(accepted.created ? HttpStatus.ACCEPTED : HttpStatus.OK);

    return {
      status: accepted.created ? 'accepted' : 'duplicate',
      eventId: accepted.event.id,
      providerEventId: accepted.event.providerEventId,
      processingStatus: accepted.event.status,
      created: accepted.created,
    };
  }

  @Get('events/summary')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Webhook inbox summary for the caller’s tenant',
    description: 'Requires `ADMIN`. Counts by processing status, plus unattributed events.',
  })
  @ApiOkResponse({ type: WebhookEventSummaryDto })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN` — not an `ADMIN`.' })
  async summary(@CurrentUser('tenantId') tenantId: string): Promise<WebhookEventSummaryDto> {
    return WebhookEventSummaryDto.from(await this.inbox.summary(tenantId));
  }

  @Post('events/process')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Process due webhook events now',
    description:
      'Requires `ADMIN`. Runs a single processing pass immediately instead of waiting for the ' +
      'poll interval. Safe to call repeatedly: leasing is atomic and the handler is idempotent.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { processed: { type: 'integer', example: 3 } },
    },
  })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN` — not an `ADMIN`.' })
  async processNow(): Promise<{ processed: number }> {
    return { processed: await this.processor.processOnce() };
  }
}
