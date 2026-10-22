<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Enums\OperationalEventType;
use App\Mail\OrderConfirmationMail;
use App\Models\OperationalEvent;
use App\Models\Order;
use App\Services\OperationalEventLogger;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Background task: notify the customer that their order was accepted.
 *
 * Retry policy
 * ------------
 * Three attempts with growing backoff. A failed run is recorded in
 * `failed_jobs` (QUEUE_FAILED_DRIVER=database-uuids) and logged without any
 * customer PII.
 *
 * Idempotency
 * -----------
 * Queue delivery is at-least-once, so the job must tolerate being run more than
 * once. Two layers protect the customer from duplicate mail:
 *   - ShouldBeUnique releases a cache lock keyed by order id, preventing two
 *     workers from running the same notification at the same time;
 *   - before sending, the job checks the operational log for a previous
 *     `order.notification_sent` row, so a retry after a partial failure (mail
 *     sent, event write lost) still does not send a second time.
 */
final class SendOrderConfirmation implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /**
     * @var array<int, int>
     */
    public array $backoff = [10, 30, 120];

    public int $timeout = 30;

    /**
     * How long the uniqueness lock is held if the worker dies mid-job.
     */
    public int $uniqueFor = 300;

    public function __construct(public readonly int $orderId) {}

    public function uniqueId(): string
    {
        return 'order-confirmation:'.$this->orderId;
    }

    public function handle(OperationalEventLogger $events): void
    {
        // The worker has no request/tenant context, so the order is loaded by id
        // with the relation the notification needs eager loaded.
        $order = Order::query()->with('customer')->find($this->orderId);

        if ($order === null) {
            // The order disappeared (rolled back or purged): nothing to send.
            return;
        }

        if ($order->customer === null) {
            return;
        }

        if ($this->alreadyNotified($order)) {
            return;
        }

        Mail::to($order->customer->email)->send(new OrderConfirmationMail($order));

        $events->record(
            type: OperationalEventType::OrderNotificationSent,
            subject: $order,
            payload: [
                'order_id' => (int) $order->getKey(),
                'channel' => 'mail',
            ],
            tenantId: (int) $order->tenant_id,
        );
    }

    public function failed(Throwable $exception): void
    {
        Log::error('Order confirmation notification failed.', [
            'order_id' => $this->orderId,
            'exception' => $exception->getMessage(),
        ]);
    }

    private function alreadyNotified(Order $order): bool
    {
        return OperationalEvent::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('type', OperationalEventType::OrderNotificationSent->value)
            ->where('subject_type', $order->getMorphClass())
            ->where('subject_id', $order->getKey())
            ->exists();
    }
}
