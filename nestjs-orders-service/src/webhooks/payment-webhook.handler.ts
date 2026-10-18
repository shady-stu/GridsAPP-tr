/**
 * Applies a verified payment webhook to an order.
 *
 * This is where "the provider said the money moved" becomes "the order is PAID". Three things
 * make it safe:
 *
 *  1. **The tenant is discovered from the database, not from the payload.** A caller cannot
 *     claim to be tenant X; we look up the order by id and use *its* tenant. The signature
 *     proves the payload came from the provider; the lookup proves which tenant it belongs to.
 *  2. **The transition is a compare-and-swap** (`OrderRepository.transitionStatus`), so a
 *     concurrent manual change or a second in-flight event cannot both succeed.
 *  3. **Money is cross-checked.** If the payload's amount/currency disagree with the stored
 *     order, the event is refused permanently rather than silently marking an order paid.
 *
 * Failure classification is deliberate: a missing order is *transient* (the webhook may arrive
 * before the order's transaction commits), while an unsupported event type, a missing order id
 * or a mismatched amount is *permanent*.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ORDER_REPOSITORY, type OrderRepository } from '../orders/repositories/order.repository.js';
import type { OrderStatus } from '../generated/prisma/enums.js';
import { canTransition } from '../orders/order-status.machine.js';
import { normaliseMoney } from '../common/utils/money.util.js';
import type { WebhookEventRecord } from './entities/webhook-event.entity.js';
import { PermanentWebhookError, TransientWebhookError } from './webhook-errors.js';
import type { PaymentWebhookEnvelopeDto } from './dto/payment-webhook.dto.js';

/** Event type -> the status the order must end up in. */
const TARGET_STATUS_BY_EVENT_TYPE: Readonly<Record<string, OrderStatus>> = {
  'payment.succeeded': 'PAID',
  'payment.refunded': 'REFUNDED',
  'payment.failed': 'CANCELLED',
};

export interface WebhookHandleOutcome {
  /** Tenant resolved from the order; persisted on the inbox row for auditing and filtering. */
  tenantId: string | null;
  /** Short human-readable description of what happened, used by the processor's log line. */
  note: string;
}

@Injectable()
export class PaymentWebhookHandler {
  private readonly logger = new Logger(PaymentWebhookHandler.name);

  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async handle(event: WebhookEventRecord): Promise<WebhookHandleOutcome> {
    const target = TARGET_STATUS_BY_EVENT_TYPE[event.eventType];
    if (!target) {
      throw new PermanentWebhookError(
        `Unsupported webhook event type "${event.eventType}". Known types: ${Object.keys(
          TARGET_STATUS_BY_EVENT_TYPE,
        ).join(', ')}`,
      );
    }

    const envelope = event.payload as PaymentWebhookEnvelopeDto | null;
    const orderId = envelope?.data?.orderId;
    if (!orderId) {
      throw new PermanentWebhookError(
        `Webhook ${event.providerEventId} of type "${event.eventType}" is missing data.orderId`,
      );
    }

    const order = await this.orders.findAcrossTenantsById(orderId);
    if (!order) {
      // Not permanent: the provider can legitimately beat our own commit.
      throw new TransientWebhookError(`Order ${orderId} does not exist yet`);
    }

    if (order.deletedAt) {
      throw new PermanentWebhookError(`Order ${orderId} is deleted; event ${event.providerEventId} ignored`);
    }

    this.assertAmountMatches(envelope, orderId, order.currency, order.totalAmount);

    // Redelivery of the same state is a success, not an error: the desired end state holds.
    if (order.status === target) {
      return {
        tenantId: order.tenantId,
        note: `order ${orderId} already ${target} (no-op)`,
      };
    }

    if (!canTransition(order.status, target)) {
      throw new PermanentWebhookError(
        `Order ${orderId} cannot move from ${order.status} to ${target} for event ${event.providerEventId}`,
      );
    }

    const updated = await this.orders.transitionStatus({
      tenantId: order.tenantId,
      orderId,
      from: order.status,
      to: target,
      // No user caused this change; the audit row records the provider event instead.
      changedByUserId: null,
      reason: `${event.provider} event ${event.providerEventId} (${event.eventType})`,
    });

    if (!updated) {
      // Somebody else changed the order between the read and the compare-and-swap.
      throw new TransientWebhookError(
        `Order ${orderId} changed concurrently while applying ${event.providerEventId}`,
      );
    }

    this.logger.log(`Applied ${event.eventType} to order ${orderId}: ${order.status} -> ${target}`);
    return { tenantId: order.tenantId, note: `order ${orderId}: ${order.status} -> ${target}` };
  }

  /**
   * Rejects the event when the provider's amount or currency disagrees with the stored order.
   * This is the guard against "provider sends the wrong order id and we mark it paid anyway".
   */
  private assertAmountMatches(
    envelope: PaymentWebhookEnvelopeDto | null,
    orderId: string,
    orderCurrency: string,
    orderTotalAmount: string,
  ): void {
    const amount = envelope?.data?.amount;
    if (amount !== undefined && normaliseMoney(amount) !== orderTotalAmount) {
      throw new PermanentWebhookError(
        `Amount mismatch for order ${orderId}: provider sent ${normaliseMoney(amount)}, order is ${orderTotalAmount}`,
      );
    }

    const currency = envelope?.data?.currency;
    if (currency !== undefined && currency.toUpperCase() !== orderCurrency) {
      throw new PermanentWebhookError(
        `Currency mismatch for order ${orderId}: provider sent ${currency.toUpperCase()}, order is ${orderCurrency}`,
      );
    }
  }
}
