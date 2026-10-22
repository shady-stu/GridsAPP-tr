/**
 * Wires the webhooks feature.
 *
 * `OrdersModule` is imported so the payment handler can apply status transitions through the
 * order repository port — note that it reuses the *same* repository the HTTP API uses, so the
 * state machine and the audit trail cannot diverge between the two entry points.
 *
 * Everything here is a singleton: the processor is one poller per process, and the repository
 * binding is the one place that knows the inbox lives in PostgreSQL.
 */
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentWebhookHandler } from './payment-webhook.handler.js';
import { WEBHOOK_EVENT_REPOSITORY } from './repositories/webhook-event.repository.js';
import { PrismaWebhookEventRepository } from './repositories/prisma-webhook-event.repository.js';
import { WebhookInboxService } from './webhook-inbox.service.js';
import { WebhookProcessorService } from './webhook-processor.service.js';
import { WebhookSignatureService } from './webhook-signature.service.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [OrdersModule],
  controllers: [WebhooksController],
  providers: [
    WebhookSignatureService,
    WebhookInboxService,
    PaymentWebhookHandler,
    WebhookProcessorService,
    { provide: WEBHOOK_EVENT_REPOSITORY, useClass: PrismaWebhookEventRepository },
  ],
  exports: [WebhookInboxService, WebhookProcessorService],
})
export class WebhooksModule {}
