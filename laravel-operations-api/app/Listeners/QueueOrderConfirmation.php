<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Enums\OperationalEventType;
use App\Events\OrderCreated;
use App\Jobs\SendOrderConfirmation;
use App\Services\OperationalEventLogger;

/**
 * Turns "an order was created" into "a notification job is queued".
 *
 * The listener stays synchronous on purpose: enqueueing is cheap and must happen
 * immediately (the event is already dispatched post-commit), while the slow work
 * - rendering and sending mail - happens in the worker where it can be retried.
 */
final class QueueOrderConfirmation
{
    public function __construct(private readonly OperationalEventLogger $events) {}

    public function handle(OrderCreated $event): void
    {
        SendOrderConfirmation::dispatch((int) $event->order->getKey());

        $this->events->record(
            type: OperationalEventType::OrderNotificationQueued,
            subject: $event->order,
            payload: [
                'order_id' => (int) $event->order->getKey(),
                'channel' => 'mail',
            ],
        );
    }
}
